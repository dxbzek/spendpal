import { describe, it, expect } from 'vitest';
import { savingsSummary, budgetPace, goalPace, goalDeadlineLabel, goalPaceLabel } from '@/lib/finance/pace';

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

  it('uses the one-off limit it is given, so yen-sized lunches still make a pace', () => {
    // A 1,200 lunch on 14 days. Against the fixed 500 every one was a one-off:
    // no pace, and the budget "ended the month" where it stood (16,800).
    const rows = Array.from({ length: 14 }, (_, i) => row(1200, i + 1));
    const budget = { amount: 40_000, spent: 16_800 };
    expect(budgetPace(budget, rows, 14, 30, 10_000)).toEqual({ projected: 36_000, hasPace: true });
    // And the other way: with a limit of 20, a 400 purchase is a one-off.
    expect(budgetPace({ amount: 100, spent: 400 }, [row(400, 2)], 14, 30, 20)).toEqual({ projected: 400, hasPace: false });
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
    expect(goalPace(500, -1)).toEqual({ kind: 'overdue' });
    expect(goalPace(500, null)).toBeNull();
    expect(goalPace(0, 30)).toBeNull();
  });
  it('treats a deadline of today as due today, not overdue', () => {
    expect(goalPace(500, 0)).toEqual({ kind: 'dueToday', amount: 500 });
    expect(goalDeadlineLabel(0)).toBe('Due today');
    expect(goalDeadlineLabel(-1)).toBe('Overdue');
    expect(goalDeadlineLabel(12)).toBe('12d');
  });
  it('asks nothing of a paused goal', () => {
    expect(goalPace(4700, 77, true)).toBeNull();
    expect(goalPaceLabel(goalPace(4700, 77, true), String)).toBeNull();
  });
  it('words the need in the singular for one month and one day', () => {
    const money = (n: number) => n.toFixed(0);
    expect(goalPaceLabel(goalPace(1000, 45), money)).toBe('Needs 1000/mo for 1 month'); // was "1 months"
    expect(goalPaceLabel(goalPace(1000, 60), money)).toBe('Needs 500/mo for 2 months');
    expect(goalPaceLabel(goalPace(1000, 1), money)).toBe('Needs all of it in 1 day');
    expect(goalPaceLabel(goalPace(1000, 0), money)).toBe('Needs all of it today');
    expect(goalPaceLabel(goalPace(1000, -3), money)).toBeNull();
  });
});
