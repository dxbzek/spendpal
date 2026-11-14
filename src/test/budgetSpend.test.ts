import { describe, it, expect } from 'vitest';
import { asMonthly, budgetPercent, rolloverAmount, spentByBudgetCategory, unspentOf } from '@/lib/finance/budgetSpend';
import { activeBudgets, budgetsForMonth } from '@/utils/budgets';
import type { Budget } from '@/types/finance';

const tx = (category: string, amount: number, date: string, o: { type?: 'expense' | 'income'; isInternal?: boolean; isTrackingOnly?: boolean } = {}) =>
  ({ type: 'expense' as const, category, amount, date, ...o });

describe('spentByBudgetCategory', () => {
  const rows = [
    tx('Food', 600, '2026-10-05'),
    tx('Dining', 350, '2026-10-20'), // counts toward a Food budget
    tx('Food', 40, '2026-11-02'),
    tx('Food', 75, '2026-11-25'), // dated after "today"
    tx('Food', 999, '2026-10-09', { isInternal: true }),
    tx('Food', 999, '2026-10-10', { isTrackingOnly: true }),
    tx('Salary', 10_000, '2026-10-30', { type: 'income' }),
  ];
  const names = new Set(['Food']);

  it('sums one month only, with aliases folded into the budget they belong to', () => {
    expect(spentByBudgetCategory(rows, '2026-10', names)).toEqual({ Food: 950 });
  });

  it('leaves out rows dated after the cut-off', () => {
    expect(spentByBudgetCategory(rows, '2026-11', names, '2026-11-14')).toEqual({ Food: 40 });
    expect(spentByBudgetCategory(rows, '2026-11', names, '2026-11-25')).toEqual({ Food: 115 });
  });
});

describe('rollover', () => {
  it('adds what was left of last month, measured against last month\'s spending', () => {
    // Budget 1,000, 950 spent last month, 40 spent so far this month.
    // The old sum used this month's 40: 1,000 + (1,000 - 40) = 1,960.
    const rows = [tx('Food', 950, '2026-10-12'), tx('Food', 40, '2026-11-02')];
    const lastMonth = spentByBudgetCategory(rows, '2026-10', new Set(['Food']));
    expect(unspentOf(1000, lastMonth.Food)).toBe(50);
    expect(rolloverAmount(1000, lastMonth.Food)).toBe(1050);
  });

  it('adds nothing when last month was overspent, and all of it when nothing was spent', () => {
    expect(rolloverAmount(400, 776.71)).toBe(400);
    expect(rolloverAmount(400, 0)).toBe(800);
  });

  it('keeps to two decimals', () => {
    expect(rolloverAmount(550, 420.95)).toBe(679.05);
  });
});

describe('budgetPercent', () => {
  it('is not capped at 100: 776.71 of 400 is 194%', () => {
    expect(budgetPercent(776.71, 400)).toBe(194);
  });
  it('is 0 without a budget amount', () => {
    expect(budgetPercent(50, 0)).toBe(0);
  });
});

describe('weekly budgets read as monthly', () => {
  const b = (o: Partial<Budget>): Budget => ({
    id: '1', category: 'Food', categoryIcon: '🍔', amount: 200, spent: 350, period: 'monthly', month: '2026-11', ...o,
  });

  it('converts a weekly amount to a month: amount x 52 / 12, two decimals', () => {
    // 200 a week against 350 spent by mid-month read "175%, Over Budget".
    const monthly = asMonthly(b({ period: 'weekly' }));
    expect(monthly).toMatchObject({ amount: 866.67, period: 'monthly' });
    expect(budgetPercent(monthly.spent, monthly.amount)).toBe(40);
  });

  it('leaves a monthly budget as it is', () => {
    const monthly = b({});
    expect(asMonthly(monthly)).toBe(monthly);
  });

  it('is what every screen gets from budgetsForMonth and activeBudgets', () => {
    const budgets = [b({ period: 'weekly' }), b({ id: '2', category: 'Rent', amount: 1900 })];
    expect(budgetsForMonth(budgets, '2026-11').map(x => [x.period, x.amount])).toEqual([['monthly', 866.67], ['monthly', 1900]]);
    expect(activeBudgets(budgets, '2026-11').reduce((s, x) => s + x.amount, 0)).toBeCloseTo(2766.67, 2);
  });
});
