// Home's month-end spending forecast. Pure, so it's unit-tested.
//
// A straight line from today (spent so far ÷ days × days in month) turns one
// trip into a month of trips. Instead:
//   spent so far (actual, one-offs included)
//   + days left × everyday daily spend (no recurring bills, no one-offs over
//     ONE_OFF_OVER, no internal or tracking-only rows)
//   + recurring bills from last month that haven't posted yet this month.
// The everyday rate comes from this month and the two before it; the lowest
// and highest of those give the range. Before MIN_DAY there's too little of
// the month to say anything, so there's no forecast.
import type { Transaction } from '@/types/finance';
import { isCountableExpense } from '@/lib/finance/transactionFilters';

export const ONE_OFF_OVER = 500;
export const MIN_DAY = 10;

const pad = (n: number) => String(n).padStart(2, '0');
const monthKey = (y: number, m: number) => {
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

const isEveryday = (t: Transaction) => isCountableExpense(t) && !t.isRecurring && t.amount <= ONE_OFF_OVER;

export interface SpendingForecast {
  spentSoFar: number;
  /** Middle estimate for the month's total spend. */
  projected: number;
  low: number;
  high: number;
  everydayPerDay: number;
  recurringStillDue: number;
  oneOffs: { count: number; total: number };
  daysElapsed: number;
  daysInMonth: number;
  lastMonthSpent: number;
}

export function spendingForecast(transactions: Transaction[], now: Date): SpendingForecast | null {
  const y = now.getFullYear(), m = now.getMonth();
  const daysElapsed = now.getDate();
  const daysInMonth = daysIn(y, m);
  if (daysElapsed < MIN_DAY) return null;

  const thisMonth = monthKey(y, m);
  const today = `${thisMonth}-${pad(daysElapsed)}`;
  const inMonth = (key: string) => (t: Transaction) => t.date.startsWith(key);

  const monthTx = transactions.filter(t => inMonth(thisMonth)(t) && t.date <= today && isCountableExpense(t));
  const spentSoFar = monthTx.reduce((s, t) => s + t.amount, 0);
  if (spentSoFar === 0) return null;
  const oneOffRows = monthTx.filter(t => !t.isRecurring && t.amount > ONE_OFF_OVER);

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
    daysElapsed,
    daysInMonth,
    lastMonthSpent: transactions
      .filter(t => inMonth(lastMonth)(t) && isCountableExpense(t))
      .reduce((s, t) => s + t.amount, 0),
  };
}
