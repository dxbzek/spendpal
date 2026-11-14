import { describe, it, expect } from 'vitest';
import { savingsSummary, budgetPace, goalPace } from '@/lib/finance/pace';

const row = (amount: number, day: number, isRecurring = false) =>
  ({ amount, date: `2026-11-${String(day).padStart(2, '0')}`, isRecurring });

describe('savingsSummary', () => {
  it('gives no rate when spending is above income (was "-3050%")', () => {
    expect(savingsSummary(224, 7054.9)).toEqual({ kind: 'overspent', amount: 6830.9 });
  });
  it('gives a rate when income covers spending', () => {
    expect(savingsSummary(10000, 7500)).toEqual({ kind: 'saved', rate: 25, amount: 2500 });
    expect(savingsSummary(10000, 10000)).toEqual({ kind: 'saved', rate: 0, amount: 0 });
  });
  it('gives nothing without income', () => {
    expect(savingsSummary(0, 500)).toEqual({ kind: 'none' });
  });
});

describe('budgetPace', () => {
  it('projects everyday spending past the budget instead of stopping at it', () => {
    // 420.95 in 14 days against 550: heading for about 902, not "550".
    const rows = [row(120.95, 2), row(100, 5), row(90, 9), row(110, 12)];
    const pace = budgetPace({ amount: 550, spent: 420.95 }, rows, 14, 30);
    expect(pace.hasPace).toBe(true);
    expect(pace.projected).toBeCloseTo(902.04, 1);
  });

  it('counts a one-off and a recurring bill once', () => {
    const rows = [row(861.11, 1), row(20, 3), row(20, 6), row(20, 9), row(60, 4, true)];
    const pace = budgetPace({ amount: 1706, spent: 981.11 }, rows, 15, 30);
    // 60 everyday in 15 days = 4 a day, 15 days left.
    expect(pace.projected).toBeCloseTo(981.11 + 60, 2);
  });

  it('does not invent a pace from one or two payments', () => {
    expect(budgetPace({ amount: 200, spent: 196.88 }, [row(196.88, 3)], 14, 30)).toEqual({ projected: 196.88, hasPace: false });
    expect(budgetPace({ amount: 200, spent: 200 }, [row(100, 1), row(100, 8)], 14, 30).hasPace).toBe(false);
  });

  it('lands a fixed budget on its amount, or on what was spent if that is more', () => {
    expect(budgetPace({ amount: 1900, spent: 0, isFixed: true }, [], 3, 30)).toEqual({ projected: 1900, hasPace: false });
    expect(budgetPace({ amount: 1900, spent: 2000, isFixed: true }, [row(2000, 1)], 3, 30).projected).toBe(2000);
  });
});

describe('goalPace', () => {
  it('says what a goal needs each month to make its deadline', () => {
    // 4,700 left with 77 days: about 3 months, not "less than a month".
    const pace = goalPace(4700, 77);
    expect(pace).toMatchObject({ kind: 'perMonth', months: 3 });
    expect(pace && pace.kind === 'perMonth' && pace.amount).toBeCloseTo(1566.67, 2);
  });
  it('asks for the whole remainder when under 45 days are left', () => {
    expect(goalPace(500, 20)).toEqual({ kind: 'inDays', amount: 500, days: 20 });
  });
  it('flags a passed deadline and stays quiet without one or when done', () => {
    expect(goalPace(500, 0)).toEqual({ kind: 'overdue' });
    expect(goalPace(500, null)).toBeNull();
    expect(goalPace(0, 30)).toBeNull();
  });
});
