// Pure "where do I actually stand" math for the home screen: net position,
// what each card needs paid by its due date, and what's left until payday.
// No React, no imports beyond types, so every number on Home is unit-tested.
import type { Account, Transaction } from '@/types/finance';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** `day` of the given month, clamped to the month's length (31 → Feb 28). */
function dayInMonth(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

/** Next date with day-of-month `day`, on or after `from` (strictly after when `strict`). */
export function nextOccurrence(day: number, from: Date, strict = false): Date {
  const today = startOfDay(from);
  const candidate = dayInMonth(today.getFullYear(), today.getMonth(), day);
  if (strict ? candidate > today : candidate >= today) return candidate;
  return dayInMonth(today.getFullYear(), today.getMonth() + 1, day);
}

export const daysBetween = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);

/** Cash and debit money minus everything owed on credit accounts. */
export function netPosition(accounts: Pick<Account, 'type' | 'balance'>[]) {
  let cash = 0, owed = 0;
  for (const a of accounts) {
    if (a.type === 'credit') owed += a.balance;
    else cash += a.balance;
  }
  return { cash: round2(cash), owed: round2(owed), net: round2(cash - owed) };
}

export interface InstallmentPlanSummary {
  accountId: string;
  merchant: string;
  monthly: number;
  total: number;
  paid: number;
  /** Instalments not yet billed × monthly amount. */
  remaining: number;
}

/**
 * Groups installment transactions into plans, the same way the Installments
 * page does (merchant + instalment count), keeping the latest row's progress.
 */
export function installmentPlans(transactions: Transaction[]): InstallmentPlanSummary[] {
  const map = new Map<string, Transaction>();
  for (const tx of transactions) {
    if (tx.totalInstallments == null || tx.currentInstallment == null) continue;
    const key = `${tx.merchant}|${tx.totalInstallments}`;
    const prev = map.get(key);
    if (!prev || tx.date > prev.date) map.set(key, tx);
  }
  return [...map.values()].map(tx => {
    const total = tx.totalInstallments!;
    const paid = Math.min(total, tx.currentInstallment ?? 0);
    return {
      accountId: tx.accountId,
      merchant: tx.merchant,
      monthly: tx.amount,
      total,
      paid,
      remaining: round2(Math.max(0, total - paid) * tx.amount),
    };
  });
}

export interface CardDue {
  account: Account;
  dueDate: Date;
  /** Statement that this due date pays off; null when no statement day is set. */
  statementDate: Date | null;
  /** True when that statement hasn't been generated yet, so the figure is a projection. */
  projected: boolean;
  owed: number;
  /** Posted charges dated after the statement — they land on the next bill. */
  newSinceStatement: number;
  /** Converted-to-instalment balance still to be billed in later months. */
  instalmentsRemaining: number;
  amountDue: number;
}

/**
 * What a card needs paid by its next due date:
 *
 *   owed − charges posted after the statement − unbilled instalment balance
 *
 * Payments made since the statement are already reflected in `owed`, so this
 * equals "statement balance minus what you've paid towards it", which is the
 * number the bank will actually ask for.
 */
export function cardPaymentDue(
  account: Account,
  transactions: Transaction[],
  plans: InstallmentPlanSummary[],
  now: Date,
): CardDue | null {
  if (account.type !== 'credit' || !account.dueDate) return null;
  const today = startOfDay(now);
  const dueDate = nextOccurrence(account.dueDate, today);

  let statementDate: Date | null = null;
  if (account.statementDate && account.statementDate > 0) {
    statementDate = dayInMonth(dueDate.getFullYear(), dueDate.getMonth(), account.statementDate);
    if (statementDate >= dueDate) {
      statementDate = dayInMonth(dueDate.getFullYear(), dueDate.getMonth() - 1, account.statementDate);
    }
  }
  const projected = statementDate != null && statementDate > today;

  let newSinceStatement = 0;
  if (statementDate && !projected) {
    const stmtKey = toKey(statementDate);
    const todayKey = toKey(today);
    for (const tx of transactions) {
      if (tx.accountId !== account.id || tx.type !== 'expense') continue;
      // Tracking-only and pending rows don't move the settled balance, so
      // they can't be subtracted from it either.
      if (tx.isTrackingOnly || tx.isPending) continue;
      const d = tx.date.slice(0, 10);
      if (d > stmtKey && d <= todayKey) newSinceStatement += tx.amount;
    }
  }

  const instalmentsRemaining = plans
    .filter(p => p.accountId === account.id)
    .reduce((s, p) => s + p.remaining, 0);

  const owed = account.balance;
  return {
    account,
    dueDate,
    statementDate,
    projected,
    owed: round2(owed),
    newSinceStatement: round2(newSinceStatement),
    instalmentsRemaining: round2(instalmentsRemaining),
    amountDue: round2(Math.max(0, owed - newSinceStatement - instalmentsRemaining)),
  };
}

/** Day of month of the most recent Salary income, or null if none logged. */
export function inferPayday(transactions: Pick<Transaction, 'type' | 'category' | 'date'>[]): number | null {
  let latest: string | null = null;
  for (const tx of transactions) {
    if (tx.type !== 'income' || tx.category !== 'Salary') continue;
    if (!latest || tx.date > latest) latest = tx.date;
  }
  return latest ? Number(latest.slice(8, 10)) : null;
}

/**
 * Money that's genuinely free until the next payday: cash on hand, minus
 * pending holds on cash/debit accounts, minus every card payment currently due.
 */
export function leftUntilPayday(opts: {
  accounts: Account[];
  transactions: Transaction[];
  cardDues: CardDue[];
  payday: number;
  now: Date;
}) {
  const { accounts, transactions, cardDues, payday, now } = opts;
  const cashIds = new Set(accounts.filter(a => a.type !== 'credit').map(a => a.id));
  const { cash } = netPosition(accounts);
  const holds = transactions
    .filter(t => t.isPending && t.type === 'expense' && !t.isTrackingOnly && cashIds.has(t.accountId))
    .reduce((s, t) => s + t.amount, 0);
  const cardsDue = cardDues.reduce((s, c) => s + c.amountDue, 0);
  const nextPayday = nextOccurrence(payday, now, true);
  const days = Math.max(1, daysBetween(now, nextPayday));
  const left = round2(cash - holds - cardsDue);
  return {
    cash,
    holds: round2(holds),
    cardsDue: round2(cardsDue),
    left,
    nextPayday,
    days,
    perDay: round2(Math.max(0, left) / days),
  };
}
