// Recurring bills, and when each next falls due. Pure, so "Left until payday",
// Upcoming Bills, Recurring Expenses and the "not logged" banner are unit-tested.
//
// One bill per merchant + category: the latest logged row sets the amount and
// the day of month. A bill already logged this cycle moves to next month.
// Every screen reads bills from here. Counting each logged row as its own
// bill listed and summed the same bill once per month it was logged.
// Instalment rows are left out: the Installments page owns them.
// "Left until payday" also leaves out bills on a credit card: they land on
// that card's statement, which Card payments already counts.
import { addMonths, parseISO, subMonths } from 'date-fns';
import type { Account, Transaction } from '@/types/finance';

export interface RecurringBill {
  key: string;
  name: string;
  icon: string;
  amount: number;
  dueOn: Date;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const recurringKey = (t: Pick<Transaction, 'merchant' | 'category'>) =>
  `${t.merchant.trim().toLowerCase()}|${t.category}`;

/**
 * Latest row of each recurring bill, keyed by merchant + category.
 * `type` 'income' gives recurring income (a salary) the same way. An income
 * row is never an instalment plan, so its instalment fields are ignored.
 */
export function latestRecurring(transactions: Transaction[], type: 'expense' | 'income' = 'expense'): Map<string, Transaction> {
  const latest = new Map<string, Transaction>();
  for (const t of transactions) {
    if (!t.isRecurring || t.type !== type || t.isInternal || t.isTrackingOnly) continue;
    if (type === 'expense' && t.totalInstallments) continue;
    const k = recurringKey(t);
    const prev = latest.get(k);
    if (!prev || t.date > prev.date) latest.set(k, t);
  }
  return latest;
}

/** A bill not logged for this many months has stopped. It is no longer listed, summed or asked for. */
export const RECURRING_STALE_MONTHS = 3;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The bills still running: the latest row of each, minus those not logged in the last 3 months. */
export function activeRecurring(transactions: Transaction[], now: Date, type: 'expense' | 'income' = 'expense'): Transaction[] {
  const cutoff = ymd(subMonths(startOfDay(now), RECURRING_STALE_MONTHS));
  return [...latestRecurring(transactions, type).values()].filter(t => t.date.slice(0, 10) >= cutoff);
}

/**
 * The first monthly occurrence after the logged date that is today or later.
 * Null when that is more than `maxMonths` after the logged date.
 */
export function nextDueDate(loggedDate: string, now: Date, maxMonths = 24): Date | null {
  const today = startOfDay(now);
  // Step from the logged date so the day of month survives short months.
  const base = parseISO(loggedDate.slice(0, 10));
  for (let offset = 1; offset <= maxMonths; offset++) {
    const dueOn = addMonths(base, offset);
    if (dueOn >= today) return dueOn;
  }
  return null;
}

/** What the running bills cost in one month: each bill once, at its latest amount. */
export const monthlyRecurringTotal = (bills: Transaction[]) =>
  Math.round(bills.reduce((s, t) => s + t.amount, 0) * 100) / 100;

/** Running bills with no row dated this month yet. */
export function notLoggedThisMonth(transactions: Transaction[], now: Date): Transaction[] {
  const month = ymd(now).slice(0, 7);
  return activeRecurring(transactions, now).filter(t => t.date.slice(0, 7) < month);
}

/** Recurring cash/debit bills with their next due date after today (today counts). */
export function nextRecurringBills(accounts: Account[], transactions: Transaction[], now: Date): RecurringBill[] {
  const creditIds = new Set(accounts.filter(a => a.type === 'credit').map(a => a.id));
  const bills: RecurringBill[] = [];
  for (const [key, t] of latestRecurring(transactions)) {
    if (creditIds.has(t.accountId) || t.amount <= 0) continue;
    const dueOn = nextDueDate(t.date, now);
    if (!dueOn) continue; // not logged for 2 years: stale, not a bill
    bills.push({ key, name: t.merchant || t.category, icon: t.categoryIcon, amount: t.amount, dueOn });
  }
  return bills.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime());
}
