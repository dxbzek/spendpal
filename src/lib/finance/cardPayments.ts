// What each card's statement asks for, and what's left until payday. Pure
// functions, no React, so the numbers on Home are unit-tested.
//
// The amounts come straight from the fields typed in from each statement
// (statementTotalDue / statementMinDue / statementDueOn). Nothing here derives
// an amount from transactions or instalment plans: those can't see what the
// bank actually billed, and a guessed number is worse than none.
import type { Account } from '@/types/finance';

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** 'YYYY-MM-DD' → local-midnight Date (new Date('YYYY-MM-DD') would be UTC). */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export type CardStatus =
  | { kind: 'missing'; account: Account }
  | { kind: 'due'; account: Account; total: number; min: number | null; dueOn: Date }
  | { kind: 'passed'; account: Account; total: number; min: number | null; dueOn: Date };

/** A credit card's statement as entered: missing, upcoming (or due today), or past its due date. */
export function cardStatus(account: Account, now: Date): CardStatus {
  const total = account.statementTotalDue;
  if (total == null || !account.statementDueOn) return { kind: 'missing', account };
  const dueOn = parseDay(account.statementDueOn);
  const min = account.statementMinDue ?? null;
  return dueOn < startOfDay(now)
    ? { kind: 'passed', account, total, min, dueOn }
    : { kind: 'due', account, total, min, dueOn };
}

/**
 * A credit account that is a card: it has a limit or a due day. A personal
 * debt (money owed to a friend) is a credit account with neither; it belongs
 * on the Debt page, not in card payments.
 */
export const isCard = (a: Account) => a.type === 'credit' && ((a.creditLimit ?? 0) > 0 || a.dueDate != null);

export function cardStatuses(accounts: Account[], now: Date): CardStatus[] {
  return accounts
    .filter(isCard)
    .map(a => cardStatus(a, now))
    .sort((a, b) => {
      // Upcoming first (soonest due), then passed, then missing.
      const rank = (s: CardStatus) => (s.kind === 'due' ? 0 : s.kind === 'passed' ? 1 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.kind !== 'missing' && b.kind !== 'missing') return a.dueOn.getTime() - b.dueOn.getTime();
      return a.account.name.localeCompare(b.account.name);
    });
}

/** Next date after today falling on day-of-month `day` (clamped to short months). */
export function nextPayday(day: number, now: Date): Date {
  const today = startOfDay(now);
  const inMonth = (y: number, m: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  const thisMonth = inMonth(today.getFullYear(), today.getMonth());
  return thisMonth > today ? thisMonth : inMonth(today.getFullYear(), today.getMonth() + 1);
}

/** Cash/debit money that's yours to spend: savings marked not-spendable are left out. */
export const isSpendable = (a: Account) => a.type !== 'credit' && !a.excludeFromSpendable;

/**
 * Spendable cash/debit money minus every statement total due before the next
 * payday (a payment due on payday itself is covered by that day's salary).
 * Negative means the cash doesn't cover what's due; callers must not turn a
 * negative into a per-day allowance.
 */
export function leftUntilPayday(accounts: Account[], payday: Date, now: Date) {
  const today = startOfDay(now);
  const cashCents = accounts
    .filter(isSpendable)
    .reduce((s, a) => s + toCents(a.balance), 0);
  const dues = cardStatuses(accounts, now).filter(
    (s): s is Extract<CardStatus, { kind: 'due' }> => s.kind === 'due' && s.dueOn >= today && s.dueOn < payday,
  );
  const dueCents = dues.reduce((s, d) => s + toCents(d.total), 0);
  const leftCents = cashCents - dueCents;
  const days = Math.max(1, Math.round((startOfDay(payday).getTime() - today.getTime()) / 86_400_000));
  return {
    cash: fromCents(cashCents),
    due: fromCents(dueCents),
    dues,
    left: fromCents(leftCents),
    days,
    // Only meaningful when there's money left; null tells the UI to show none.
    perDay: leftCents > 0 ? fromCents(Math.floor(leftCents / days)) : null,
  };
}

/** Day of month of the most recent Salary income, or null when none is logged. */
export function inferPayday(transactions: { type: string; category: string; date: string }[]): number | null {
  let latest: string | null = null;
  for (const t of transactions) {
    if (t.type === 'income' && t.category === 'Salary' && (!latest || t.date > latest)) latest = t.date;
  }
  return latest ? Number(latest.slice(8, 10)) : null;
}
