// Recurring bills, and when each next falls due. Pure, so "Left until payday",
// Upcoming Bills, Recurring Expenses and the "not logged" banner are unit-tested.
//
// One bill per merchant + category: the latest logged row sets the amount and
// the day of month. A bill already logged this cycle moves to next month.
// Two rows of one merchant + category in the same month at clearly different
// amounts (a mobile line and home internet from one telecom) are two bills.
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
 * Two amounts in one month that are the same bill logged again (a corrected
 * amount): within 20% of each other. Further apart, they are two bills.
 */
const sameBillAmount = (a: number, b: number) => Math.abs(a - b) <= 0.2 * Math.max(Math.abs(a), Math.abs(b));

/**
 * The bills among one merchant + category's rows, oldest row first. A row
 * whose month already has a row of about the same amount is that bill logged
 * again. Otherwise it is the next payment of the bill with no row in its
 * month yet, the one closest in amount. Otherwise it is one more bill.
 * Returns the latest row of each bill.
 */
const byDate = (a: Transaction, b: Transaction) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Months in which this merchant + category has two rows of clearly different
 * amounts. One such month is not enough to call it two bills: a variable bill
 * paid early (next month's 300 on the 30th, after this month's 410 on the 2nd)
 * or one rent paid in two parts looks the same, and a phantom second bill then
 * inflates every total for three months. Two months of it is a pattern.
 */
function monthsWithTwoAmounts(rows: Transaction[]): number {
  const byMonth = new Map<string, number[]>();
  for (const t of rows) {
    const m = t.date.slice(0, 7);
    const list = byMonth.get(m);
    if (list) list.push(t.amount);
    else byMonth.set(m, [t.amount]);
  }
  let n = 0;
  for (const amounts of byMonth.values()) {
    if (amounts.some((a, i) => amounts.some((b, j) => j > i && !sameBillAmount(a, b)))) n++;
  }
  return n;
}

export const MIN_MONTHS_FOR_SECOND_BILL = 2;

function splitBills(rows: Transaction[]): Transaction[] {
  const sorted = [...rows].sort(byDate);
  if (monthsWithTwoAmounts(rows) < MIN_MONTHS_FOR_SECOND_BILL) return [sorted[sorted.length - 1]];
  const bills: Transaction[][] = [];
  for (const t of sorted) {
    const month = t.date.slice(0, 7);
    const last = (b: Transaction[]) => b[b.length - 1];
    const again = bills.find(b => last(b).date.slice(0, 7) === month && sameBillAmount(last(b).amount, t.amount));
    if (again) { again.push(t); continue; }
    const free = bills
      .filter(b => last(b).date.slice(0, 7) < month)
      .sort((a, b) => Math.abs(last(a).amount - t.amount) - Math.abs(last(b).amount - t.amount));
    if (free[0]) free[0].push(t);
    else bills.push([t]);
  }
  return bills.map(b => b[b.length - 1]);
}

/**
 * Latest row of each recurring bill, keyed by merchant + category (and #2,
 * #3 for a second and third bill of that merchant + category).
 * `type` 'income' gives recurring income (a salary) the same way. An income
 * row is never an instalment plan, so its instalment fields are ignored.
 */
export function latestRecurring(transactions: Transaction[], type: 'expense' | 'income' = 'expense'): Map<string, Transaction> {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.isRecurring || t.type !== type || t.isInternal || t.isTrackingOnly) continue;
    if (type === 'expense' && t.totalInstallments) continue;
    const k = recurringKey(t);
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  const latest = new Map<string, Transaction>();
  for (const [k, rows] of groups) {
    splitBills(rows).forEach((t, i) => latest.set(i === 0 ? k : `${k}#${i + 1}`, t));
  }
  return latest;
}

/** A bill not logged for this many months has stopped. It is no longer listed, summed or asked for. */
export const RECURRING_STALE_MONTHS = 3;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function activeEntries(transactions: Transaction[], now: Date, type: 'expense' | 'income') {
  const cutoff = ymd(subMonths(startOfDay(now), RECURRING_STALE_MONTHS));
  return [...latestRecurring(transactions, type)].filter(([, t]) => t.date.slice(0, 10) >= cutoff);
}

/** The bills still running: the latest row of each, minus those not logged in the last 3 months. */
export function activeRecurring(transactions: Transaction[], now: Date, type: 'expense' | 'income' = 'expense'): Transaction[] {
  return activeEntries(transactions, now, type).map(([, t]) => t);
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

/**
 * Running cash/debit bills with their next due date after today (today
 * counts). The same bills as Upcoming Bills: a stopped one is not subtracted.
 */
export function nextRecurringBills(accounts: Account[], transactions: Transaction[], now: Date): RecurringBill[] {
  const creditIds = new Set(accounts.filter(a => a.type === 'credit').map(a => a.id));
  const bills: RecurringBill[] = [];
  for (const [key, t] of activeEntries(transactions, now, 'expense')) {
    if (creditIds.has(t.accountId) || t.amount <= 0) continue;
    const dueOn = nextDueDate(t.date, now);
    if (!dueOn) continue;
    bills.push({ key, name: t.merchant || t.category, icon: t.categoryIcon, amount: t.amount, dueOn });
  }
  return bills.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime());
}
