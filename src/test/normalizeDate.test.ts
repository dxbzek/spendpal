import { describe, it, expect } from 'vitest';
import { normalizeDate } from '@/lib/finance/normalizeDate';

describe('normalizeDate', () => {
  it('passes through ISO YYYY-MM-DD unchanged', () => {
    expect(normalizeDate('2026-03-23')).toBe('2026-03-23');
  });

  it('strips a trailing time component', () => {
    expect(normalizeDate('23/03/2026 14:30:00')).toBe('2026-03-23');
    expect(normalizeDate('2026-03-23T08:00:00Z')).toBe('2026-03-23');
    expect(normalizeDate('2026-03-23T08:00:00+04:00')).toBe('2026-03-23');
  });

  it('converts YYYY/MM/DD to ISO', () => {
    expect(normalizeDate('2026/03/23')).toBe('2026-03-23');
  });

  it('interprets numeric slash/dash dates as day-first (DMY)', () => {
    expect(normalizeDate('23/03/2026')).toBe('2026-03-23');
    expect(normalizeDate('23-03-2026')).toBe('2026-03-23');
  });

  it('expands 2-digit years to 20xx', () => {
    expect(normalizeDate('23/03/26')).toBe('2026-03-23');
    expect(normalizeDate('5/1/26')).toBe('2026-01-05');
  });

  it('pads single-digit day/month in the loose DMY fallback', () => {
    expect(normalizeDate('5/3/2026')).toBe('2026-03-05');
  });

  it('parses DD-Mon-YYYY and DD Mon YY textual months', () => {
    expect(normalizeDate('23-Mar-2026')).toBe('2026-03-23');
    expect(normalizeDate('23-Mar-26')).toBe('2026-03-23');
    expect(normalizeDate('5 Jan 26')).toBe('2026-01-05');
    expect(normalizeDate('23 March 2026')).toBe('2026-03-23');
  });

  it('parses Mon DD, YYYY and full-month variants', () => {
    expect(normalizeDate('Mar 23, 2026')).toBe('2026-03-23');
    expect(normalizeDate('March 23 2026')).toBe('2026-03-23');
  });

  it('is case-insensitive for month names', () => {
    expect(normalizeDate('23-MAR-2026')).toBe('2026-03-23');
    expect(normalizeDate('23-mar-2026')).toBe('2026-03-23');
  });

  it('returns the (trimmed) input unchanged when unrecognized', () => {
    expect(normalizeDate('  not a date  ')).toBe('not a date');
    expect(normalizeDate('2026.03.23')).toBe('2026.03.23');
  });
});
