import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { dateKey, isInPeriod, lastMonthSameDays, msUntilTomorrow } from '@/lib/today';
import { useToday } from '@/hooks/useToday';

describe('dateKey and msUntilTomorrow', () => {
  it('gives the local date as YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 10, 5, 23, 59))).toBe('2026-11-05');
    expect(dateKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
  it('counts to the next local midnight, across a month end', () => {
    expect(msUntilTomorrow(new Date(2026, 10, 30, 23, 0, 0))).toBe(60 * 60 * 1000);
    expect(msUntilTomorrow(new Date(2026, 10, 14, 0, 0, 0))).toBe(24 * 60 * 60 * 1000);
  });
});

describe('isInPeriod (Home: Month / Year / All)', () => {
  it('leaves a row dated tomorrow out today and counts it tomorrow', () => {
    // Home fixed "now" on mount, so in an app left open overnight a row added
    // the next day stayed out of Income and Expenses.
    expect(isInPeriod('2026-11-15', 'month', '2026-11-14')).toBe(false);
    expect(isInPeriod('2026-11-15', 'month', '2026-11-15')).toBe(true);
    expect(isInPeriod('2026-11-15', 'all', '2026-11-14')).toBe(false);
  });
  it('moves to the new month when the date does', () => {
    expect(isInPeriod('2026-11-20', 'month', '2026-11-30')).toBe(true);
    expect(isInPeriod('2026-11-20', 'month', '2026-12-01')).toBe(false);
    expect(isInPeriod('2026-12-01', 'month', '2026-12-01')).toBe(true);
  });
  it('keeps Year to the calendar year and All to everything up to today', () => {
    expect(isInPeriod('2026-01-03', 'year', '2026-11-14')).toBe(true);
    expect(isInPeriod('2025-12-31', 'year', '2026-11-14')).toBe(false);
    expect(isInPeriod('2025-12-31', 'all', '2026-11-14')).toBe(true);
  });
});

describe('lastMonthSameDays', () => {
  it('sets this month so far against the same days of last month', () => {
    // On the 14th, all of October against half of November read as about -50%.
    expect(lastMonthSameDays('2026-11-14')).toEqual({ start: '2026-10-01', end: '2026-10-14', endDay: 14, monthComplete: false });
  });
  it('uses the whole of last month once this month is complete', () => {
    expect(lastMonthSameDays('2026-11-30')).toEqual({ start: '2026-10-01', end: '2026-10-31', endDay: 31, monthComplete: true });
  });
  it('stops at the end of a shorter month and crosses the year', () => {
    expect(lastMonthSameDays('2026-03-30')).toMatchObject({ end: '2026-02-28', monthComplete: false });
    expect(lastMonthSameDays('2026-01-15')).toMatchObject({ start: '2025-12-01', end: '2025-12-15' });
  });

  it('gives a like-for-like change: equal daily spending reads 0%, not -53%', () => {
    const spend = (from: string, to: string, days: string[]) => days.filter(d => d >= from && d <= to).length * 100;
    const october = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    const november = Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
    const range = lastMonthSameDays('2026-11-14');
    const last = spend(range.start, range.end, october);
    const now = spend('2026-11-01', '2026-11-14', november);
    expect(last).toBe(1400); // not 3,100
    expect(Math.round(((now - last) / last) * 100)).toBe(0);
  });
});

describe('useToday', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('moves to the next day at midnight while the app stays open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 30, 23, 0, 0));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe('2026-11-30');
    act(() => { vi.advanceTimersByTime(59 * 60 * 1000); });
    expect(result.current).toBe('2026-11-30');
    act(() => { vi.advanceTimersByTime(2 * 60 * 1000); });
    expect(result.current).toBe('2026-12-01');
    // And again the night after: the timer re-arms itself.
    act(() => { vi.advanceTimersByTime(24 * 60 * 60 * 1000); });
    expect(result.current).toBe('2026-12-02');
  });

  it('catches up when the app comes back to the front after the timer was missed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 22, 0, 0));
    const { result } = renderHook(() => useToday());
    // The phone slept: the clock moved on but no timer fired.
    vi.setSystemTime(new Date(2026, 10, 15, 8, 0, 0));
    expect(result.current).toBe('2026-11-14');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current).toBe('2026-11-15');
    vi.setSystemTime(new Date(2026, 10, 16, 8, 0, 0));
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(result.current).toBe('2026-11-16');
  });
});
