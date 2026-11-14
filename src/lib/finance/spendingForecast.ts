// Home's month-end spending forecast. Pure, so it's unit-tested.
//
// A straight line from today (spent so far ÷ days × days in month) turns one
// trip into a month of trips. Instead:
//   spent so far (actual, one-offs included)
//   + days left × everyday daily spend (no recurring bills, no one-offs over
//     the one-off limit, no internal or tracking-only rows)
//   + recurring bills from last month that haven't posted yet this month.
// The everyday rate comes from this month and the two before it; the lowest
// and highest of those give the range. Before MIN_DAY there's too little of
// the month to say anything, so there's no forecast.
import type { Transaction } from '@/types/finance';
import { isCountableExpense } from '@/lib/finance/transactionFilters';

/** The one-off limit when there are too few rows to work one out. */
export const ONE_OFF_OVER = 500;
export const MIN_DAY = 10;

/** How far back oneOffLimit looks. */
export const ONE_OFF_WINDOW_DAYS = 90;
/** Fewer everyday purchases than this in the window say too little about what is usual. */
export const ONE_OFF_MIN_ROWS = 20;
/** A purchase this many times the usual one is a one-off. */
export const ONE_OFF_TIMES_MEDIAN = 10;

const pad = (n: number) => String(n).padStart(2, '0');
const monthKey = (y: number, m: number) => {
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Nearest of 1, 2, 5, 10 times a power of ten (…, 200, 500, 1,000, …), judged by ratio. */
function roundTo125(x: number): number {
  const base = 10 ** Math.floor(Math.log10(x));
  const lead = x / base;
  const step = lead < Math.SQRT2 ? 1 : lead < Math.sqrt(10) ? 2 : lead < Math.sqrt(50) ? 5 : 10;
  return Number((step * base).toPrecision(1));
}

/**
 * The amount above which a purchase is a one-off, from the user's own rows.
 *
 * It was a fixed 500, sized for dirhams. In yen or pesos almost every lunch
 * is over 500, so the forecast treated all daily spending as one-offs and
 * projected none of it. The limit is now ONE_OFF_TIMES_MEDIAN times the
 * median purchase of the last ONE_OFF_WINDOW_DAYS days (recurring bills left
 * out), rounded to a 1-2-5 step so it's a plain figure that doesn't move
 * with every new row. A median purchase of about 32 to 70 gives 500.
 *
 * `today` is YYYY-MM-DD. With fewer than ONE_OFF_MIN_ROWS rows it's ONE_OFF_OVER.
 */
export function oneOffLimit(
  transactions: Pick<Transaction, 'type' | 'isInternal' | 'isTrackingOnly' | 'isRecurring' | 'amount' | 'date'>[],
  today: string,
): number {
  const [y, m, d] = today.split('-').map(Number);
  const from = new Date(y, m - 1, d - ONE_OFF_WINDOW_DAYS);
  const since = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
  const amounts = transactions
    .filter(t => isCountableExpense(t) && !t.isRecurring && t.amount > 0 && t.date > since && t.date <= today)
    .map(t => t.amount)
    .sort((a, b) => a - b);
  if (amounts.length < ONE_OFF_MIN_ROWS) return ONE_OFF_OVER;
  const mid = amounts.length >> 1;
  const median = amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2;
  return roundTo125(median * ONE_OFF_TIMES_MEDIAN);
}

export interface SpendingForecast {
  spentSoFar: number;
  /** Middle estimate for the month's total spend. */
  projected: number;
  low: number;
  high: number;
  everydayPerDay: number;
  recurringStillDue: number;
  oneOffs: { count: number; total: number };
  /** The one-off limit this forecast used, for the note that names it. */
  oneOffOver: number;
  daysElapsed: number;
  daysInMonth: number;
  lastMonthSpent: number;
}

/** `oneOffOver` is the user's one-off limit (see oneOffLimit). */
export function spendingForecast(transactions: Transaction[], now: Date, oneOffOver: number = ONE_OFF_OVER): SpendingForecast | null {
  const y = now.getFullYear(), m = now.getMonth();
  const daysElapsed = now.getDate();
  const daysInMonth = daysIn(y, m);
  if (daysElapsed < MIN_DAY) return null;

  const isEveryday = (t: Transaction) => isCountableExpense(t) && !t.isRecurring && t.amount <= oneOffOver;

  const thisMonth = monthKey(y, m);
  const today = `${thisMonth}-${pad(daysElapsed)}`;
  const inMonth = (key: string) => (t: Transaction) => t.date.startsWith(key);

  const monthTx = transactions.filter(t => inMonth(thisMonth)(t) && t.date <= today && isCountableExpense(t));
  const spentSoFar = monthTx.reduce((s, t) => s + t.amount, 0);
  if (spentSoFar === 0) return null;
  const oneOffRows = monthTx.filter(t => !t.isRecurring && t.amount > oneOffOver);

  // Everyday spend per day: this month so far, then each of the two full months before.
  const rates = [monthTx.filter(isEveryday).reduce((s, t) => s + t.amount, 0) / daysElapsed];
  for (const back of [1, 2]) {
    const key = monthKey(y, m - back);
    const rows = transactions.filter(t => inMonth(key)(t) && isEveryday(t));
    if (rows.length) rates.push(rows.reduce((s, t) => s + t.amount, 0) / daysIn(y, m - back));
  }
  const avgRate = rates.reduce((s, r) => s + r, 0) / rates.length;

  // Last month's recurring bills that fall later in the month and haven't posted yet.
  const lastMonth = monthKey(y, m - 1);
  const postedThisMonth = new Set(monthTx.filter(t => t.isRecurring).map(t => t.merchant.trim().toLowerCase()));
  const recurringStillDue = transactions
    .filter(t => inMonth(lastMonth)(t) && t.isRecurring && isCountableExpense(t))
    .filter(t => Number(t.date.slice(8, 10)) > daysElapsed && !postedThisMonth.has(t.merchant.trim().toLowerCase()))
    .reduce((s, t) => s + t.amount, 0);

  const daysLeft = daysInMonth - daysElapsed;
  const at = (rate: number) => Math.round(spentSoFar + daysLeft * rate + recurringStillDue);

  return {
    spentSoFar,
    projected: at(avgRate),
    low: at(Math.min(...rates)),
    high: at(Math.max(...rates)),
    everydayPerDay: avgRate,
    recurringStillDue,
    oneOffs: { count: oneOffRows.length, total: oneOffRows.reduce((s, t) => s + t.amount, 0) },
    oneOffOver,
    daysElapsed,
    daysInMonth,
    lastMonthSpent: transactions
      .filter(t => inMonth(lastMonth)(t) && isCountableExpense(t))
      .reduce((s, t) => s + t.amount, 0),
  };
}
