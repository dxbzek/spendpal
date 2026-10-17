import { describe, it, expect } from 'vitest';
import type { Account, Transaction } from '@/types/finance';
import {
  ordinal, nextOccurrence, netPosition, installmentPlans,
  cardPaymentDue, inferPayday, leftUntilPayday,
} from '@/lib/finance/position';

const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  type: 'expense',
  amount: 0,
  currency: 'AED',
  category: 'Other',
  categoryIcon: '📌',
  merchant: 'X',
  accountId: 'card',
  date: '2026-10-01',
  ...o,
});

const card: Account = {
  id: 'card', name: 'ENBD', type: 'credit', balance: 10_000, currency: 'AED', icon: '🏦',
  creditLimit: 20_000, statementDate: 15, dueDate: 10,
};
const bank: Account = { id: 'bank', name: 'Bank', type: 'debit', balance: 6_000, currency: 'AED', icon: '💳' };

const now = new Date(2026, 9, 17); // 17 Oct 2026

describe('ordinal', () => {
  it('uses the right suffix', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st'],
    );
  });
});

describe('nextOccurrence', () => {
  it('returns today when the day is today, unless strict', () => {
    expect(nextOccurrence(17, now).getDate()).toBe(17);
    expect(nextOccurrence(17, now, true).getMonth()).toBe(10);
  });
  it('clamps to short months', () => {
    expect(nextOccurrence(31, new Date(2026, 1, 1)).getDate()).toBe(28);
  });
});

describe('netPosition', () => {
  it('subtracts card debt from cash', () => {
    expect(netPosition([bank, card])).toEqual({ cash: 6_000, owed: 10_000, net: -4_000 });
  });
});

describe('cardPaymentDue', () => {
  it('is owed minus post-statement charges minus unbilled instalments', () => {
    const txs = [
      tx({ amount: 300, date: '2026-10-16' }),              // after 15 Oct statement → next bill
      tx({ amount: 200, date: '2026-10-14' }),              // on the statement
      tx({ amount: 50, date: '2026-10-16', isPending: true }), // not posted
      tx({ merchant: 'Laptop EMI', amount: 250, totalInstallments: 12, currentInstallment: 3, isTrackingOnly: true }),
    ];
    const due = cardPaymentDue(card, txs, installmentPlans(txs), now)!;
    expect(due.dueDate).toEqual(new Date(2026, 10, 10));
    expect(due.statementDate).toEqual(new Date(2026, 9, 15));
    expect(due.projected).toBe(false);
    expect(due.newSinceStatement).toBe(300);
    expect(due.instalmentsRemaining).toBe(2_250); // 9 × 250
    expect(due.amountDue).toBe(10_000 - 300 - 2_250);
  });

  it('flags a projection when the statement has not been cut yet', () => {
    const due = cardPaymentDue(card, [], [], new Date(2026, 9, 12))!;
    expect(due.statementDate).toEqual(new Date(2026, 9, 15));
    expect(due.projected).toBe(true);
    expect(due.amountDue).toBe(10_000);
  });

  it('ignores instalment plans on other accounts and skips cards with no due day', () => {
    const plans = installmentPlans([tx({ accountId: 'other', totalInstallments: 4, currentInstallment: 1, amount: 100 })]);
    expect(cardPaymentDue(card, [], plans, now)!.instalmentsRemaining).toBe(0);
    expect(cardPaymentDue({ ...card, dueDate: undefined }, [], [], now)).toBeNull();
  });
});

describe('inferPayday', () => {
  it('reads the day of the latest salary', () => {
    expect(inferPayday([
      tx({ type: 'income', category: 'Salary', date: '2026-08-28' }),
      tx({ type: 'income', category: 'Salary', date: '2026-09-27' }),
      tx({ type: 'income', category: 'Gift', date: '2026-10-05' }),
    ])).toBe(27);
    expect(inferPayday([])).toBeNull();
  });
});

describe('leftUntilPayday', () => {
  it('takes card dues and pending holds out of cash', () => {
    const txs = [tx({ accountId: 'bank', amount: 100, isPending: true })];
    const due = cardPaymentDue(card, [], [], now)!; // 10,000 due
    const r = leftUntilPayday({ accounts: [bank, card], transactions: txs, cardDues: [due], payday: 27, now });
    expect(r.left).toBe(6_000 - 100 - 10_000);
    expect(r.perDay).toBe(0);
    expect(r.days).toBe(10);
  });
});
