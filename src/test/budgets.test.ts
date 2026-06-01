import { describe, it, expect } from 'vitest';
import { activeBudgetMonth, activeBudgets } from '@/utils/budgets';
import type { Budget } from '@/types/finance';

const b = (id: string, category: string, month: string, amount = 100): Budget => ({
  id, category, categoryIcon: '💰', amount, spent: 0, period: 'monthly', month,
});

describe('activeBudgetMonth', () => {
  it('returns null when there are no budgets', () => {
    expect(activeBudgetMonth([], '2026-06')).toBeNull();
  });

  it('prefers the current month when budgets exist for it', () => {
    const budgets = [b('1', 'Food', '2026-05'), b('2', 'Food', '2026-06')];
    expect(activeBudgetMonth(budgets, '2026-06')).toBe('2026-06');
  });

  it('carries the most recent prior month forward when the current month has none', () => {
    const budgets = [b('1', 'Food', '2026-04'), b('2', 'Food', '2026-05')];
    expect(activeBudgetMonth(budgets, '2026-06')).toBe('2026-05');
  });
});

describe('activeBudgets', () => {
  it('returns only the active month\'s budgets (carried forward)', () => {
    const budgets = [
      b('1', 'Food', '2026-05'),
      b('2', 'Transport', '2026-05'),
      b('3', 'Food', '2026-04'),
    ];
    const active = activeBudgets(budgets, '2026-06');
    expect(active.map(x => x.id).sort()).toEqual(['1', '2']);
  });

  it('returns an empty array when there are no budgets', () => {
    expect(activeBudgets([], '2026-06')).toEqual([]);
  });
});
