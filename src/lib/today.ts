// "Today" as the app means it: the date on the user's device, as the same
// YYYY-MM-DD text every transaction row carries, so the two compare as text.
// Pure, so it's unit-tested. The hook that keeps it current is hooks/useToday.

const pad = (n: number) => String(n).padStart(2, '0');

/** A local date as YYYY-MM-DD. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Milliseconds from `now` to the next local midnight. */
export function msUntilTomorrow(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

export type HomePeriod = 'month' | 'year' | 'all';

/**
 * Whether a row dated `date` belongs in Home's Month / Year / All figures.
 * A row dated after today is not spent or earned yet, whatever the period.
 */
export function isInPeriod(date: string, period: HomePeriod, today: string): boolean {
  if (date > today) return false;
  if (period === 'all') return true;
  return date.startsWith(period === 'month' ? today.slice(0, 7) : today.slice(0, 5));
}

/**
 * The part of last month to set against this month so far: the 1st to the
 * same day. Half of this month against all of last month always read as a
 * big drop. On the last day of a month the whole of last month is used, and
 * a longer day number than last month has stops at its last day.
 */
export function lastMonthSameDays(today: string): { start: string; end: string; endDay: number; monthComplete: boolean } {
  const [y, m, d] = today.split('-').map(Number);
  const daysThisMonth = new Date(y, m, 0).getDate();
  const prev = new Date(y, m - 2, 1);
  const daysLastMonth = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
  // Today is the last day of its month, so both months are whole.
  const monthComplete = d >= daysThisMonth;
  const endDay = monthComplete ? daysLastMonth : Math.min(d, daysLastMonth);
  const key = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`;
  return { start: `${key}-01`, end: `${key}-${pad(endDay)}`, endDay, monthComplete };
}
