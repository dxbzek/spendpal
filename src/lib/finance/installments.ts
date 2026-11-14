// Instalment plans built from their transaction rows, and when each one
// really ends. Pure functions, no React, so Installments is unit-tested.
//
// A plan is the set of rows sharing one plan id; the latest row carries the
// paid count (the +/- stepper writes currentInstallment on it) and, when typed
// from a statement, the remaining principal. Rows with no plan id (logged
// before the column existed, or imported) group on account + merchant + total
// instalments + instalment amount, so two purchases at one merchant with
// different prices are still two plans.
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

/** Which plan a row belongs to: its plan id, else the fallback for rows without one. */
export const planKey = (tx: Pick<Transaction, 'planId' | 'accountId' | 'merchant' | 'totalInstallments' | 'amount'>) =>
  tx.planId
    ? `id:${tx.planId}`
    : `row:${tx.accountId}|${tx.merchant}|${tx.totalInstallments}|${round2(tx.amount).toFixed(2)}`;

const latestFirst = (rows: Transaction[]) => [...rows].sort((a, b) => b.date.localeCompare(a.date));

/** Every row of one plan, and no row of any other plan. */
export const planRows = (transactions: Transaction[], plan: Pick<InstallmentPlan, 'key'>) =>
  transactions.filter(tx => isPlanRow(tx) && planKey(tx) === plan.key);

/** The row that carries the plan's paid count and remaining principal. */
export const latestPlanRow = (transactions: Transaction[], plan: Pick<InstallmentPlan, 'key'>): Transaction | undefined =>
  latestFirst(planRows(transactions, plan))[0];

export function buildPlans(transactions: Transaction[]): InstallmentPlan[] {
  const map: Record<string, Transaction[]> = {};
  for (const tx of transactions) {
    if (!isPlanRow(tx)) continue;
    (map[planKey(tx)] ??= []).push(tx);
  }
  return Object.entries(map).map(([key, txs]) => {
    const latest = latestFirst(txs)[0];
    const totalInstallments = latest.totalInstallments!;
    const paidInstallments = latest.currentInstallment ?? 0;
    const amountPerInstallment = latest.amount;
    // 0 means "not entered", the same as empty.
    const loanTotalAmount = latest.loanTotalAmount && latest.loanTotalAmount > 0 ? latest.loanTotalAmount : null;
    return {
      key,
      planId: latest.planId ?? null,
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
 * The plan id for a plan row that is about to be saved.
 * A row that carries on a plan already open (same account, merchant, term and
 * instalment amount, logged later with a higher paid count) is that plan's
 * next payment and joins it. Anything else starts a new plan with its own
 * id, so two purchases at one merchant stay two plans.
 * undefined = join a plan whose rows have no id yet: the row must have none
 * either, or it would split off from them.
 */
export function planIdForNewRow(
  transactions: Transaction[],
  row: Pick<Transaction, 'accountId' | 'merchant' | 'totalInstallments' | 'currentInstallment' | 'amount' | 'date'>,
  newId: () => string = newUuid,
): string | undefined {
  const fallbackKey = planKey({ ...row, planId: null });
  const open = buildPlans(transactions).find(p =>
    planKey({ ...p, planId: null, amount: p.amountPerInstallment }) === fallbackKey &&
    p.paidInstallments < p.totalInstallments &&
    p.paidInstallments < (row.currentInstallment ?? 0) &&
    p.latestDate <= row.date);
  return open ? open.planId ?? undefined : newId();
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
