import type { Budget } from '@/types/finance';
import { asMonthly } from '@/lib/finance/budgetSpend';

/**
 * A month's own budgets (month = 'YYYY-MM'), nothing carried forward. This is
 * what Home and the Budgets page show: until last month's budgets are copied
 * over, the month has none, and both screens say so.
 */
export function budgetsForMonth(budgets: Budget[], monthKey: string): Budget[] {
  return budgets.filter(b => b.month === monthKey).map(asMonthly);
}

/**
 * The budget month in effect for `monthKey`, for reports. If that month has
 * its own budgets we use those; otherwise the most recent month before it, so
 * a report on a month without budgets still has something to measure against.
 * A later month is never used: budgets made in November say nothing about
 * September.
 */
export function activeBudgetMonth(budgets: Budget[], monthKey: string): string | null {
  // 'YYYY-MM' strings sort chronologically.
  const months = budgets.map(b => b.month).filter(m => m && m <= monthKey);
  if (months.length === 0) return null;
  return months.sort().at(-1)!;
}

/** Budgets in effect for `monthKey` (its own, or carried forward from the latest earlier month). */
export function activeBudgets(budgets: Budget[], monthKey: string): Budget[] {
  const month = activeBudgetMonth(budgets, monthKey);
  if (month === null) return [];
  return budgetsForMonth(budgets, month);
}
