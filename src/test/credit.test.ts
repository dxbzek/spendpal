import { describe, it, expect } from 'vitest';
import { availableCredit, creditTotals, creditUtilization } from '@/lib/finance/credit';

const card = (balance: number, creditLimit?: number) => ({ type: 'credit' as const, balance, creditLimit });

describe('creditTotals', () => {
  // Regression: the Debt page dropped the paid-off card and showed
  // limit 10,000 and 50% where Home showed 20,000 and 25%.
  it('counts the limit of a card with nothing owed', () => {
    const totals = creditTotals([card(5_000, 10_000), card(0, 10_000)]);
    expect(totals).toEqual({ limit: 20_000, used: 5_000, utilization: 25 });
  });

  it('leaves out accounts with no limit on both sides', () => {
    // A pay-later account and a personal debt have no limit to measure against.
    const totals = creditTotals([card(6_000, 12_000), card(400), card(500, 0)]);
    expect(totals).toEqual({ limit: 12_000, used: 6_000, utilization: 50 });
  });

  it('ignores cash and debit accounts', () => {
    const totals = creditTotals([{ type: 'debit', balance: 3_000 }, card(1_000, 4_000)]);
    expect(totals).toEqual({ limit: 4_000, used: 1_000, utilization: 25 });
  });

  it('counts a card in credit as nothing used', () => {
    const totals = creditTotals([card(-200, 10_000), card(2_500, 10_000)]);
    expect(totals.used).toBe(2_500);
    expect(totals.utilization).toBe(12.5);
  });

  it('caps an over-limit total at 100', () => {
    expect(creditTotals([card(12_000, 10_000)]).utilization).toBe(100);
  });

  it('has no utilization when no card has a limit', () => {
    expect(creditTotals([card(300)])).toEqual({ limit: 0, used: 0, utilization: null });
    expect(creditTotals([])).toEqual({ limit: 0, used: 0, utilization: null });
  });
});

describe('per-card credit figures', () => {
  it('reports available credit, negative when over the limit', () => {
    expect(availableCredit(card(18_000, 25_000))).toBe(7_000);
    expect(availableCredit(card(26_000, 25_000))).toBe(-1_000);
    expect(availableCredit(card(100))).toBeNull();
  });

  it('clamps utilization to 0 to 100', () => {
    expect(creditUtilization(card(5_000, 10_000))).toBe(50);
    expect(creditUtilization(card(15_000, 10_000))).toBe(100);
    expect(creditUtilization(card(-50, 10_000))).toBe(0);
    expect(creditUtilization(card(100))).toBeNull();
  });
});
