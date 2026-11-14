import { describe, it, expect } from 'vitest';
import type { Transaction } from '@/types/finance';
import { ONE_OFF_OVER, oneOffLimit, spendingForecast } from '@/lib/finance/spendingForecast';
import { dateKey } from '@/lib/today';

const TODAY = '2026-11-14';
const now = new Date(2026, 10, 14);

let n = 0;
const tx = (amount: number, date: string, o: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, type: 'expense', amount, currency: 'AED', category: 'Other', categoryIcon: '📌',
  merchant: 'x', accountId: 'bank', date, ...o,
});

/**
 * 60 days of ordinary spending in dirhams, times `scale` for another
 * currency: coffee 18, lunch 38, taxi 27, delivery 55, groceries 140,
 * fuel 150, a 320 shop and one 2,400 flight. Median purchase: 38.
 */
function typicalRows(scale = 1): Transaction[] {
  const rows: Transaction[] = [];
  for (let i = 0; i < 60; i++) {
    const date = dateKey(new Date(2026, 10, 14 - i));
    const add = (amount: number) => rows.push(tx(amount * scale, date));
    if (i % 2 === 0) add(18);
    if (i % 7 < 5) add(38);
    if (i % 3 === 0) add(27);
    if (i % 5 === 0) add(55);
    if (i % 4 === 0) add(140);
    if (i % 14 === 0) add(150);
    if (i % 30 === 0) add(320);
  }
  rows.push(tx(2400 * scale, '2026-11-06', { merchant: 'flydubai' }));
  return rows;
}

describe('oneOffLimit', () => {
  it('stays at 500 for ordinary dirham spending', () => {
    expect(oneOffLimit(typicalRows(), TODAY)).toBe(500);
  });

  it('follows the size of the user\'s own purchases in other currencies', () => {
    expect(oneOffLimit(typicalRows(16), TODAY)).toBe(5_000); // pesos
    expect(oneOffLimit(typicalRows(30), TODAY)).toBe(10_000); // yen
    expect(oneOffLimit(typicalRows(0.08), TODAY)).toBe(20); // Kuwaiti dinars
  });

  it('gives 500 for any median purchase from about 32 to 70', () => {
    const flat = (amount: number) => Array.from({ length: 30 }, (_, i) => tx(amount, dateKey(new Date(2026, 10, 14 - i))));
    expect(oneOffLimit(flat(32), TODAY)).toBe(500);
    expect(oneOffLimit(flat(55), TODAY)).toBe(500);
    expect(oneOffLimit(flat(70), TODAY)).toBe(500);
    expect(oneOffLimit(flat(25), TODAY)).toBe(200);
    expect(oneOffLimit(flat(80), TODAY)).toBe(1_000);
  });

  it('falls back to 500 with too few rows to say what is usual', () => {
    const few = Array.from({ length: 19 }, (_, i) => tx(1200, dateKey(new Date(2026, 10, 14 - i))));
    expect(oneOffLimit(few, TODAY)).toBe(ONE_OFF_OVER);
    expect(oneOffLimit([], TODAY)).toBe(500);
  });

  it('only looks at the last 90 days, and not at bills, future rows or internal rows', () => {
    const ignored = [
      ...Array.from({ length: 40 }, (_, i) => tx(9_000, dateKey(new Date(2026, 6, 1 + i)))), // July, too old
      ...Array.from({ length: 40 }, () => tx(9_000, '2026-11-03', { isRecurring: true })),
      ...Array.from({ length: 40 }, () => tx(9_000, '2026-11-20')), // after today
      ...Array.from({ length: 40 }, () => tx(9_000, '2026-11-03', { isInternal: true })),
      ...Array.from({ length: 40 }, () => tx(9_000, '2026-11-03', { type: 'income' })),
    ];
    expect(oneOffLimit([...typicalRows(), ...ignored], TODAY)).toBe(500);
  });
});

describe('spending forecast with the user\'s own one-off limit', () => {
  it('projects yen-sized everyday spending instead of calling every lunch a one-off', () => {
    const aed = typicalRows();
    const yen = typicalRows(30);
    const inAed = spendingForecast(aed, now, oneOffLimit(aed, TODAY))!;
    const inYen = spendingForecast(yen, now, oneOffLimit(yen, TODAY))!;

    // The fixed 500 dropped every yen purchase from the daily rate (18 x 30 = 540).
    expect(spendingForecast(yen, now)!.everydayPerDay).toBe(0);

    // Same spending, 30 times the unit: the same forecast, 30 times the size.
    expect(inYen.everydayPerDay).toBeCloseTo(inAed.everydayPerDay * 30, 6);
    expect(inYen.oneOffs).toEqual({ count: 1, total: 2400 * 30 });
    expect(inAed.oneOffs).toEqual({ count: 1, total: 2400 });
    expect(inYen.projected).toBeGreaterThan(inYen.spentSoFar);
  });

  it('reports the limit it used, for the note under the forecast', () => {
    const yen = typicalRows(30);
    expect(spendingForecast(yen, now, oneOffLimit(yen, TODAY))!.oneOffOver).toBe(10_000);
    expect(spendingForecast(typicalRows(), now)!.oneOffOver).toBe(500);
  });
});
