// Instalment plans built from their transaction rows, and when each one
// really ends. Pure functions, no React, so Installments is unit-tested.
//
// A plan is the set of rows sharing one plan id; the latest row carries the
// paid count (the +/- stepper writes currentInstallment on it) and, when typed
// from a statement, the remaining principal. Rows with no plan id (logged
// before the column existed, or by an old copy of the app) are matched to a
// plan by chainRows below.
//
// The row's date is when the plan was logged, not when the next instalment is
// due, so the schedule comes from the account the plan is billed to: the next
// unpaid instalment is due on that card's statement due date (or its due day),
// and one more falls due each month after that.
import type { Account, Transaction } from '@/types/finance';
import { parseDay } from '@/lib/finance/cardPayments';
import { newUuid } from '@/lib/finance/transactionWrite';

export interface InstallmentPlan {
  key: string;
  /** The id shared by the plan's rows; null when they have none. */
  planId: string | null;
  merchant: string;
  accountId: string;
  category: string;
  categoryIcon: string;
  totalInstallments: number;
  paidInstallments: number;
  amountPerInstallment: number;
  totalAmount: number;
  paidAmount: number;
  latestDate: string;
  isTrackingOnly: boolean;
  loanTotalAmount: number | null;
  remainingPrincipal: number | null;
  note: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "[CC] Noon", "[Tabby] Amazon" → "Noon", "Amazon". The account says which card. */
export const planDisplayName = (merchant: string) =>
  merchant.replace(/^\s*\[[^\]]*\]\s*/, '') || merchant;

/** A plan is a debt: only expense rows that carry both instalment counts. */
const isPlanRow = (tx: Transaction) =>
  tx.type === 'expense' && tx.totalInstallments != null && tx.currentInstallment != null;

/** Rows of one plan sit on one account, at one merchant, over one term. */
const planGroup = (tx: Pick<Transaction, 'accountId' | 'merchant' | 'totalInstallments'>) =>
  `${tx.accountId}|${tx.merchant}|${tx.totalInstallments}`;

const cents = (n: number) => Math.round(n * 100);

/**
 * Two instalment amounts that belong to one plan: equal give or take one
 * unit, or 1% of the larger. Covers a last payment of 333.34 after 333.33 and
 * Tabby's 100.01 then 99.99; a second purchase at another price is not a match.
 * In cents so the database (section 22e) does the very same sum.
 */
export const sameInstalment = (a: number, b: number) => {
  const ca = cents(a), cb = cents(b);
  return Math.abs(ca - cb) * 100 <= Math.max(10_000, Math.abs(ca), Math.abs(cb));
};

/** The order rows are read in: oldest first. Section 22e reads them the same way. */
const byLogOrder = (a: Transaction, b: Transaction) =>
  a.date.localeCompare(b.date) ||
  (a.currentInstallment ?? 0) - (b.currentInstallment ?? 0) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

interface Chain { key: string; planId: string | null; group: string; seq: number; rows: Transaction[] }

/**
 * Split plan rows into plans.
 * A row with a plan id belongs to that plan. A row without one (logged before
 * the column, or by an old copy of the app still open on a phone) is the next
 * payment of the plan on its account, merchant and term that is still open,
 * has a lower paid count and about the same instalment. Several such plans:
 * the one furthest along, then the one logged last. None: it starts a plan.
 * So a row without an id joins a plan whose rows have one, and a second
 * purchase (paid count back at 0 or 1) is a second plan even at the same price.
 * Section 22e of the review-fixes migration gives plan ids by the same rule.
 */
function chainRows(transactions: Transaction[]): Chain[] {
  const chains: Chain[] = [];
  const byId = new Map<string, Chain>();
  const last = (c: Chain) => c.rows[c.rows.length - 1];
  for (const tx of transactions.filter(isPlanRow).sort(byLogOrder)) {
    const group = planGroup(tx);
    if (tx.planId) {
      let chain = byId.get(tx.planId);
      if (!chain) {
        chain = { key: `id:${tx.planId}`, planId: tx.planId, group, seq: chains.length, rows: [] };
        byId.set(tx.planId, chain);
        chains.push(chain);
      }
      chain.group = group;
      chain.rows.push(tx);
      continue;
    }
    const paid = tx.currentInstallment ?? 0;
    const open = chains.filter(c => {
      const l = last(c);
      const lastPaid = l.currentInstallment ?? 0;
      return c.group === group && lastPaid < (l.totalInstallments ?? 0) && lastPaid < paid && sameInstalment(l.amount, tx.amount);
    }).sort((a, b) =>
      (last(b).currentInstallment ?? 0) - (last(a).currentInstallment ?? 0) ||
      last(b).date.localeCompare(last(a).date) ||
      a.seq - b.seq);
    if (open[0]) { open[0].rows.push(tx); continue; }
    chains.push({ key: `row:${tx.id}`, planId: null, group, seq: chains.length, rows: [tx] });
  }
  return chains;
}

const latestFirst = (rows: Transaction[]) => [...rows].sort((a, b) => byLogOrder(b, a));

/** Every row of one plan, and no row of any other plan. */
export const planRows = (transactions: Transaction[], plan: Pick<InstallmentPlan, 'key'>) =>
  chainRows(transactions).find(c => c.key === plan.key)?.rows ?? [];

/** The row that carries the plan's paid count and remaining principal. */
export const latestPlanRow = (transactions: Transaction[], plan: Pick<InstallmentPlan, 'key'>): Transaction | undefined =>
  latestFirst(planRows(transactions, plan))[0];

export function buildPlans(transactions: Transaction[]): InstallmentPlan[] {
  return chainRows(transactions).map(({ key, planId, rows: txs }) => {
    const latest = latestFirst(txs)[0];
    const totalInstallments = latest.totalInstallments!;
    const paidInstallments = latest.currentInstallment ?? 0;
    const amountPerInstallment = latest.amount;
    // 0 means "not entered", the same as empty.
    const loanTotalAmount = latest.loanTotalAmount && latest.loanTotalAmount > 0 ? latest.loanTotalAmount : null;
    return {
      key,
      planId,
      merchant: latest.merchant,
      accountId: latest.accountId,
      category: latest.category,
      categoryIcon: latest.categoryIcon,
      totalInstallments,
      paidInstallments,
      amountPerInstallment,
      // Like with like. With a purchase price entered: principal paid of that
      // price. Without: payments made of payments due. Payments (interest
      // included) against the price showed more paid than the total.
      totalAmount: loanTotalAmount ?? round2(amountPerInstallment * totalInstallments),
      paidAmount: loanTotalAmount != null && totalInstallments > 0
        ? round2(loanTotalAmount * Math.min(paidInstallments, totalInstallments) / totalInstallments)
        : round2(paidInstallments * amountPerInstallment),
      latestDate: latest.date,
      isTrackingOnly: txs.some(t => t.isTrackingOnly),
      loanTotalAmount,
      remainingPrincipal: latest.remainingPrincipal ?? null,
      note: latest.note ?? null,
    };
  }).sort((a, b) => {
    const aDone = a.paidInstallments >= a.totalInstallments;
    const bDone = b.paidInstallments >= b.totalInstallments;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return b.latestDate.localeCompare(a.latestDate);
  });
}

export const remainingInstallments = (p: InstallmentPlan) =>
  Math.max(0, p.totalInstallments - p.paidInstallments);

/** What's still owed: the statement's remaining principal when entered, else EMI × instalments left. Nothing once every instalment is paid. */
export const planLeft = (p: InstallmentPlan) =>
  remainingInstallments(p) === 0
    ? 0
    : p.remainingPrincipal ?? round2(remainingInstallments(p) * p.amountPerInstallment);

/**
 * The remaining principal after the paid count moves from `fromPaid` to
 * `toPaid`. The typed figure was true at the old count, so it is spread
 * evenly over the instalments that were unpaid then: paying one of 36 left
 * takes off 1/36. Without this "left" stayed at the typed figure however
 * many payments were marked paid.
 * null in means "not entered" and stays null. Stepping back from a finished
 * plan has nothing to scale from, so the figure is cleared and "left" falls
 * back to instalment x months.
 */
export function principalAfterProgress(
  remainingPrincipal: number | null | undefined,
  totalInstallments: number,
  fromPaid: number,
  toPaid: number,
): number | null | undefined {
  if (remainingPrincipal == null || fromPaid === toPaid) return remainingPrincipal;
  const leftBefore = totalInstallments - fromPaid;
  const leftAfter = totalInstallments - toPaid;
  if (leftAfter <= 0) return 0;
  if (leftBefore <= 0) return null;
  return round2(remainingPrincipal * leftAfter / leftBefore);
}

/**
 * The plan id for a plan row that is about to be saved: the id of the plan
 * it would join by the rule in chainRows (the next payment of an open plan),
 * else a new id, so two purchases at one merchant stay two plans.
 * undefined = it joins a plan whose rows have no id yet: the row must have
 * none either, or it would split off from them.
 */
export function planIdForNewRow(
  transactions: Transaction[],
  row: Pick<Transaction, 'accountId' | 'merchant' | 'totalInstallments' | 'currentInstallment' | 'amount' | 'date'>,
  newId: () => string = newUuid,
): string | undefined {
  const probe: Transaction = {
    id: '￿', type: 'expense', currency: '', category: '', categoryIcon: '', ...row, planId: null,
  };
  const chain = chainRows([...transactions, probe]).find(c => c.rows.includes(probe))!;
  if (chain.rows.length === 1) return newId();
  return chain.planId ?? undefined;
}

export const totalLeft = (plans: InstallmentPlan[]) =>
  round2(plans.filter(p => remainingInstallments(p) > 0).reduce((s, p) => s + planLeft(p), 0));

/** Day-of-month `day` in the month `n` months after `d`, clamped to short months. */
function onDay(d: Date, n: number, day: number): Date {
  const y = d.getFullYear(), m = d.getMonth() + n;
  return new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
}

/** Next date on or after today falling on day-of-month `day`. */
function nextOnOrAfter(day: number, today: Date): Date {
  const thisMonth = onDay(today, 0, day);
  return thisMonth >= today ? thisMonth : onDay(today, 1, day);
}

/**
 * When the next unpaid instalment is due: the card's upcoming statement due
 * date, else its due day, else the plan row's own day of month.
 */
export function nextInstallmentDue(plan: InstallmentPlan, account: Account | undefined, now: Date): Date {
  const today = startOfDay(now);
  if (account?.statementDueOn) {
    const due = parseDay(account.statementDueOn);
    if (due >= today) return due;
  }
  const day = account?.dueDate ?? parseDay(plan.latestDate).getDate();
  return nextOnOrAfter(day, today);
}

/** Due dates of the first and last instalments, or null for a finished plan. */
export function planSchedule(plan: InstallmentPlan, account: Account | undefined, now: Date) {
  const left = remainingInstallments(plan);
  if (left === 0) return null;
  const nextDue = nextInstallmentDue(plan, account, now);
  // Shift by whole months on the card's due day (so a 31st stays the 31st
  // after a short month), keeping nextDue itself exactly as the statement says.
  const day = account?.dueDate ?? nextDue.getDate();
  const shift = (n: number) => (n === 0 ? nextDue : onDay(nextDue, n, day));
  return {
    nextDue,
    startedOn: shift(-plan.paidInstallments),
    endsOn: shift(left - 1),
  };
}
