import { describe, it, expect } from 'vitest';
import type { Transaction } from '@/types/finance';
import {
  grossSpending, isCountableExpense, isCountableIncome, isRefund, netSpending, refundTotal,
} from '@/lib/finance/transactionFilters';

let n = 0;
const tx = (o: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, type: 'expense', amount: 0, currency: 'AED', category: 'Shopping', categoryIcon: '🛍️',
  merchant: 'x', accountId: 'bank', date: '2026-11-03', ...o,
});

const credit = new Set(['card']);

const shoes = tx({ amount: 400, accountId: 'card' });
const groceries = tx({ amount: 250.5, category: 'Groceries' });
const salary = tx({ type: 'income', amount: 10_000, category: 'Salary' });
const bankRefund = tx({ type: 'income', amount: 120.25, category: 'Refund' });
const cardRefund = tx({ type: 'income', amount: 400, category: 'Refund', accountId: 'card' });
const cardPayment = tx({ type: 'income', amount: 3_000, category: 'Debt', accountId: 'card', isInternal: true });
const transferOut = tx({ amount: 500, category: 'Transfer', isInternal: true });
const planRow = tx({ amount: 150, isTrackingOnly: true });

describe('isRefund', () => {
  it('is an income row in the Refund category', () => {
    expect(isRefund(bankRefund)).toBe(true);
    expect(isRefund(cardRefund)).toBe(true);
    expect(isRefund(tx({ type: 'income', amount: 5, category: ' refund ' }))).toBe(true);
  });

  it('is not salary, an expense, or an internal movement', () => {
    expect(isRefund(salary)).toBe(false);
    expect(isRefund(tx({ amount: 5, category: 'Refund' }))).toBe(false);
    expect(isRefund(tx({ type: 'income', amount: 5, category: 'Refund', isInternal: true }))).toBe(false);
  });
});

describe('isCountableIncome', () => {
  // Regression: a refund to a bank account was added to Income.
  it('never counts a refund as income, on a bank account or a card', () => {
    expect(isCountableIncome(bankRefund, credit)).toBe(false);
    expect(isCountableIncome(cardRefund, credit)).toBe(false);
  });

  it('counts salary, and nothing internal or on a credit account', () => {
    expect(isCountableIncome(salary, credit)).toBe(true);
    expect(isCountableIncome(cardPayment, credit)).toBe(false);
    expect(isCountableIncome(tx({ type: 'income', amount: 9, category: 'Other', accountId: 'card' }), credit)).toBe(false);
  });

  it('adds up to salary alone for a month with a refund in it', () => {
    const rows = [shoes, groceries, salary, bankRefund, cardRefund, cardPayment];
    const income = rows.filter(t => isCountableIncome(t, credit)).reduce((s, t) => s + t.amount, 0);
    expect(income).toBe(10_000);
  });
});

describe('netSpending', () => {
  const rows = [shoes, groceries, salary, bankRefund, cardRefund, cardPayment, transferOut, planRow];

  // Regression: the returned purchase stayed in Expenses in full. A card
  // refund was ignored; a bank refund became income.
  it('takes refunds off spending, whichever account they landed on', () => {
    expect(grossSpending(rows)).toBe(650.5);
    expect(refundTotal(rows)).toBe(520.25);
    expect(netSpending(rows)).toBe(130.25);
  });

  it('is the plain total when there are no refunds', () => {
    expect(netSpending([shoes, groceries, salary])).toBe(650.5);
  });

  it('leaves out transfers, card payments and tracking-only rows, as before', () => {
    expect(isCountableExpense(transferOut)).toBe(false);
    expect(isCountableExpense(planRow)).toBe(false);
    expect(netSpending([transferOut, planRow, cardPayment])).toBe(0);
  });

  it('stops at zero when the refunds are more than the spending in the period', () => {
    // The purchase was last month; only its refund is in these rows.
    expect(netSpending([groceries, cardRefund])).toBe(0);
  });

  it('adds to the cent', () => {
    const rows3 = [tx({ amount: 0.1 }), tx({ amount: 0.2 })];
    expect(grossSpending(rows3)).toBe(0.3);
  });
});
