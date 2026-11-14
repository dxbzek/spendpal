import { describe, it, expect } from 'vitest';
import { budgetCategoryOf, usedCategories, pickerCategories } from '@/lib/finance/categories';
import { EXPENSE_CATEGORIES } from '@/types/finance';

const row = (category: string, date: string, icon = '📌', extra: object = {}) =>
  ({ type: 'expense' as const, category, categoryIcon: icon, date, isInternal: false, ...extra });

describe('budgetCategoryOf', () => {
  it('counts an alias toward the broader budget', () => {
    const budgets = new Set(['Food', 'Bills']);
    expect(budgetCategoryOf('Dining', budgets)).toBe('Food');
    expect(budgetCategoryOf('Coffee', budgets)).toBe('Food');
    expect(budgetCategoryOf('Telecom', budgets)).toBe('Bills');
  });
  it('leaves a row alone when its own name has a budget, or neither does', () => {
    expect(budgetCategoryOf('Dining', new Set(['Dining', 'Food']))).toBe('Dining');
    expect(budgetCategoryOf('Dining', new Set(['Groceries']))).toBe('Dining');
    expect(budgetCategoryOf('Gaming', new Set(['Food']))).toBe('Gaming');
  });
});

describe('usedCategories', () => {
  it('lists the categories in the rows, most used first, with the newest icon', () => {
    const rows = [
      row('Food', '2026-11-01', '🍽️'), row('Food', '2026-11-09', '🍕'), row('Food', '2026-11-03', '🍽️'),
      row('Church', '2026-11-02', '🤲'),
      row('Transfer', '2026-11-02', '🔁', { isInternal: true }),
      row('Salary', '2026-10-30', '💰', { type: 'income' }),
    ];
    rows.push(row('Church', '2026-11-08', '🤲'), row('Salary', '2026-09-30', '💰', { type: 'income' }));
    expect(usedCategories(rows, 'expense')).toEqual([{ name: 'Food', icon: '🍕' }, { name: 'Church', icon: '🤲' }]);
    expect(usedCategories(rows, 'income')).toEqual([{ name: 'Salary', icon: '💰' }]);
  });

  it('leaves out one-offs and names only old rows use', () => {
    const rows = [
      row('Food', '2026-11-01'), row('Food', '2026-11-02'),
      row('Car Rental', '2026-10-12'),
      row('Restaurants', '2026-06-01'), row('Restaurants', '2026-06-02'), row('Restaurants', '2026-06-03'),
    ];
    expect(usedCategories(rows, 'expense', '2026-08-16').map(c => c.name)).toEqual(['Food']);
  });
});

describe('pickerCategories', () => {
  const names = (list: { name: string }[]) => list.map(c => c.name);

  it('puts used categories first and drops built-in aliases of them', () => {
    const used = [{ name: 'Food', icon: '🍽️' }, { name: 'Church', icon: '🤲' }, { name: 'Bills', icon: '💡' }];
    const list = names(pickerCategories(used, [], EXPENSE_CATEGORIES));
    expect(list.slice(0, 3)).toEqual(['Food', 'Church', 'Bills']);
    for (const alias of ['Dining', 'Coffee', 'Delivery', 'Telecom', 'DEWA', 'Utilities']) expect(list).not.toContain(alias);
    expect(list).toContain('Groceries');
    // "Transport" is a built-in, so its alias never shows beside it.
    expect(list).toContain('Transport');
    expect(list).not.toContain('Metro/Taxi');
  });

  it('keeps an alias the user actually uses', () => {
    const used = [{ name: 'Food', icon: '🍽️' }, { name: 'Coffee', icon: '☕' }];
    expect(names(pickerCategories(used, [], EXPENSE_CATEGORIES))).toContain('Coffee');
  });

  it('offers the full built-in list to a new user', () => {
    expect(names(pickerCategories([], [], EXPENSE_CATEGORIES))).toEqual(names([...EXPENSE_CATEGORIES]).filter(n => n !== 'Metro/Taxi'));
  });

  it('uses a custom category\'s icon, lists unused custom ones, and hides a renamed default', () => {
    const custom = [{ name: 'Gaming', icon: '🎮', isCustom: true }, { name: 'Eating out', icon: '🍕', isCustom: true, originalName: 'Dining' }];
    const list = pickerCategories([{ name: 'Gaming', icon: '📌' }], custom, EXPENSE_CATEGORIES);
    expect(list[0]).toMatchObject({ name: 'Gaming', icon: '🎮' });
    expect(names(list)).toContain('Eating out');
    expect(names(list)).not.toContain('Dining');
  });

  it('never lists a name twice, whatever its case', () => {
    const list = names(pickerCategories([{ name: 'groceries', icon: '🛒' }], [], EXPENSE_CATEGORIES));
    expect(list.filter(n => n.toLowerCase() === 'groceries')).toHaveLength(1);
  });
});
