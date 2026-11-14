// Budget arithmetic every screen shares: what was spent against a budget in a
// month, what rolls over, the percentage shown, and how an old weekly row is
// read. Pure, so it's unit-tested.
import type { Transaction } from '@/types/finance';
import { isCountableExpense } from '@/lib/finance/transactionFilters';
import { budgetCategoryOf } from '@/lib/finance/categories';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Spending per budget category in one month (`month` is YYYY-MM).
 * `budgetNames` are that month's budgets, so a "Dining" row counts toward a
 * "Food" budget. With `upTo` (YYYY-MM-DD), rows dated after it are left out:
 * a future-dated row is not spent yet.
 *
 * Pending rows are counted on purpose: a pending charge is spending the user
 * has committed to. Pending only decides whether the account balance moves.
 */
export function spentByBudgetCategory(
  txs: Pick<Transaction, 'type' | 'isInternal' | 'isTrackingOnly' | 'category' | 'amount' | 'date'>[],
  month: string,
  budgetNames: ReadonlySet<string> = new Set(),
  upTo?: string,
): Record<string, number> {
  const spent: Record<string, number> = {};
  for (const t of txs) {
    if (!isCountableExpense(t) || !t.date.startsWith(month)) continue;
    if (upTo !== undefined && t.date > upTo) continue;
    const category = budgetCategoryOf(t.category, budgetNames);
    spent[category] = (spent[category] ?? 0) + t.amount;
  }
  return spent;
}

/**
 * For each budget, the other category names whose rows were counted toward
 * it in that month (a "Dining" row in a "Food" budget), most spent first.
 * Same rows and rules as spentByBudgetCategory, so a card can say what its
 * figure includes: the alias rules are built in and were not shown anywhere.
 */
export function includedCategories(
  txs: Pick<Transaction, 'type' | 'isInternal' | 'isTrackingOnly' | 'category' | 'amount' | 'date'>[],
  month: string,
  budgetNames: ReadonlySet<string> = new Set(),
  upTo?: string,
): Record<string, string[]> {
  const byBudget: Record<string, Record<string, number>> = {};
  for (const t of txs) {
    if (!isCountableExpense(t) || !t.date.startsWith(month)) continue;
    if (upTo !== undefined && t.date > upTo) continue;
    const budget = budgetCategoryOf(t.category, budgetNames);
    if (budget === t.category || !budgetNames.has(budget)) continue;
    const names = (byBudget[budget] ??= {});
    names[t.category] = (names[t.category] ?? 0) + t.amount;
  }
  return Object.fromEntries(Object.entries(byBudget).map(([budget, names]) => [
    budget,
    Object.entries(names).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name),
  ]));
}

/** What was left of last month's budget. Nothing when it was overspent. */
export function unspentOf(budgetAmount: number, spentThatMonth: number): number {
  return round2(Math.max(0, budgetAmount - spentThatMonth));
}

/**
 * This month's budget with last month's unspent part added. `spentLastMonth`
 * must be last month's spending: a budget row's own `spent` is always the
 * current month's, which made a 1,000 budget with 950 spent roll over as
 * almost 2,000 early in the month.
 */
export function rolloverAmount(budgetAmount: number, spentLastMonth: number): number {
  return round2(budgetAmount + unspentOf(budgetAmount, spentLastMonth));
}

/**
 * Spent as a whole percentage of the budget, not capped: 776.71 of 400 is
 * 194%, not 100%. Cap the bar's width where it is drawn, not the number.
 */
export function budgetPercent(spent: number, amount: number): number {
  return amount > 0 ? Math.round((spent / amount) * 100) : 0;
}

/**
 * A budget amount the app may save: a real number above zero. The database
 * accepts 0, but the app drops a zero-amount budget when it loads (schemas.ts),
 * so a saved 0 is a row the user can never see or delete. An AI suggestion
 * is the one place a 0 could come from; the form already refuses it.
 */
export function isBudgetAmount(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Weekly budgets are retired. Spending is only ever summed per month, so a
 * weekly amount was compared with a month of spending and read "Over Budget"
 * from the second week. The database converts old weekly rows to monthly with
 * the same sum; this covers a row read before that has run.
 */
export function asMonthly<T extends { amount: number; period: string }>(budget: T): T & { period: 'monthly' } {
  if (budget.period !== 'weekly') return budget as T & { period: 'monthly' };
  return { ...budget, amount: weeklyToMonthly(budget.amount), period: 'monthly' };
}

/**
 * A weekly amount as a monthly one: 52 weeks over 12 months, to the cent.
 * The one sum for it in the app. The database migration and restore_backup()
 * use the same (round(amount * 52 / 12, 2)).
 */
export function weeklyToMonthly(amount: number): number {
  return round2(amount * 52 / 12);
}
