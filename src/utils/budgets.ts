import type { Budget } from '@/types/finance';

/**
 * The budget month currently in effect. Budgets are stored per-month
 * (month = 'YYYY-MM'). If the current month has its own budgets we use those;
 * otherwise we carry the most recent prior month's budgets forward so the
 * active set never silently empties when a new month begins.
 */
export function activeBudgetMonth(budgets: Budget[], currentMonthKey: string): string | null {
  if (budgets.some(b => b.month === currentMonthKey)) return currentMonthKey;
  const months = budgets.map(b => b.month).filter(Boolean);
  if (months.length === 0) return null;
  // 'YYYY-MM' strings sort chronologically.
  return months.sort().at(-1)!;
}

/** Budgets that apply to the current month (current month, or carried forward). */
export function activeBudgets(budgets: Budget[], currentMonthKey: string): Budget[] {
  const month = activeBudgetMonth(budgets, currentMonthKey);
  if (month === null) return [];
  return budgets.filter(b => b.month === month);
}
