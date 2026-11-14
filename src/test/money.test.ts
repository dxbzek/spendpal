import { describe, it, expect } from 'vitest';
import { addMoney, moneyDifference, roundAccountMoney, roundMoney, roundMoneyOrEmpty } from '@/lib/finance/money';
import { reconcileAdjustment } from '@/lib/finance/reconcile';

describe('roundMoney', () => {
  it('removes the floating point tail from a computed amount', () => {
    expect(1234.56 - 1000.1).not.toBe(234.46); // the raw difference is 234.45999999999992
    expect(roundMoney(1234.56 - 1000.1)).toBe(234.46);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('leaves an amount that is already to the cent unchanged', () => {
    for (const n of [0, 0.01, 5319.71, 17800, 199.99, 1250.38, -150.25]) expect(roundMoney(n)).toBe(n);
  });

  it('rounds a half cent away from zero', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(0.285)).toBe(0.29);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(0.005)).toBe(0.01);
  });

  it('rounds anything under half a cent to a plain zero', () => {
    expect(roundMoney(0.0049)).toBe(0);
    expect(Object.is(roundMoney(-0.004), 0)).toBe(true);
  });

  it('passes a non-number through for the caller to reject', () => {
    expect(roundMoney(NaN)).toBeNaN();
  });

  it('keeps an empty field empty', () => {
    expect(roundMoneyOrEmpty(null)).toBeNull();
    expect(roundMoneyOrEmpty(undefined)).toBeUndefined();
    expect(roundMoneyOrEmpty(0.1 + 0.2)).toBe(0.3);
  });
});

describe('addMoney', () => {
  it('adds goal progress to the cent', () => {
    expect(110.1 + 220.2).not.toBe(330.3); // the raw sum is 330.29999999999995
    expect(addMoney(110.1, 220.2)).toBe(330.3);
    expect(addMoney(0.1, 0.2)).toBe(0.3);
  });

  it('subtracts a withdrawal to the cent', () => {
    expect(0.3 - 0.1).not.toBe(0.2);
    expect(addMoney(0.3, -0.1)).toBe(0.2);
  });
});

describe('roundAccountMoney', () => {
  it('rounds every money field of an account', () => {
    const out = roundAccountMoney({
      name: 'Card', balance: 0.1 + 0.2, creditLimit: 20000.004, statementTotalDue: 4321.979999, statementMinDue: null,
    });
    expect(out).toEqual({ name: 'Card', balance: 0.3, creditLimit: 20000, statementTotalDue: 4321.98, statementMinDue: null });
  });

  it('does not add a field the caller left out', () => {
    // A missing statement field means "column not sent"; it must stay missing.
    const out = roundAccountMoney({ balance: 10 });
    expect(Object.keys(out)).toEqual(['balance']);
  });
});

describe('reconcileAdjustment', () => {
  // Regression: the adjustment was the raw difference, 234.45999999999992.
  it('posts the gap to the cent', () => {
    expect(reconcileAdjustment('debit', 1000.1, 1234.56)).toEqual({ type: 'income', amount: 234.46, drift: 234.46 });
  });

  it('lowers a cash balance with an expense', () => {
    expect(reconcileAdjustment('cash', 500, 420.5)).toEqual({ type: 'expense', amount: 79.5, drift: -79.5 });
  });

  it('flips the direction for a credit account, where the balance is the amount owed', () => {
    expect(reconcileAdjustment('credit', 1000, 1200)?.type).toBe('expense');
    expect(reconcileAdjustment('credit', 1200, 1000)?.type).toBe('income');
  });

  it('treats a gap under half a cent as no drift', () => {
    expect(reconcileAdjustment('debit', 1234.5599999999999, 1234.56)).toBeNull();
    expect(reconcileAdjustment('debit', 0.1 + 0.2, 0.3)).toBeNull();
    expect(moneyDifference(0.3, 0.1 + 0.2)).toBe(0);
  });

  it('still sees a one cent gap', () => {
    expect(reconcileAdjustment('debit', 100, 100.01)).toEqual({ type: 'income', amount: 0.01, drift: 0.01 });
  });

  it('reconciles to a negative figure: an overdrawn account or a card in credit', () => {
    expect(reconcileAdjustment('debit', 50, -150.25)).toEqual({ type: 'expense', amount: 200.25, drift: -200.25 });
    expect(reconcileAdjustment('credit', 100, -20)).toEqual({ type: 'income', amount: 120, drift: -120 });
  });

  it('has nothing to post for a figure that is not a number', () => {
    expect(reconcileAdjustment('debit', 100, NaN)).toBeNull();
  });
});
