import { describe, it, expect } from 'vitest';
import type { Account, Transaction } from '@/types/finance';
import { recentFees, priceRises, isFee } from '@/lib/finance/chargeAlerts';
import { leftUntilPayday } from '@/lib/finance/cardPayments';

const now = new Date(2026, 10, 6, 10, 0); // 6 Nov 2026

let n = 0;
const tx = (o: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, type: 'expense', amount: 0, currency: 'AED', category: 'Other', categoryIcon: '📌',
  merchant: 'x', accountId: 'bank', date: '2026-11-01', ...o,
});

describe('fees', () => {
  it('catches the Fees category and fee-like merchant names', () => {
    expect(isFee(tx({ category: 'Fees', merchant: 'Tabby statement fee' }))).toBe(true);
    expect(isFee(tx({ merchant: 'VAT ON PROCESSING FEE' }))).toBe(true);
    expect(isFee(tx({ merchant: 'FINANCE CHARGES' }))).toBe(true);
    expect(isFee(tx({ merchant: 'Coffee Planet' }))).toBe(false);
    expect(isFee(tx({ type: 'income', category: 'Fees', merchant: 'Fee refund' }))).toBe(false);
  });

  it('totals the last 30 days only, newest first', () => {
    const r = recentFees([
      tx({ merchant: 'Late payment fee', amount: 100, date: '2026-10-20' }),
      tx({ category: 'Fees', merchant: 'Tabby statement fee', amount: 9.45, date: '2026-11-02' }),
      tx({ merchant: 'Annual fee', amount: 300, date: '2026-09-01' }), // too old
    ], now);
    expect(r.total).toBe(109.45);
    expect(r.fees.map(f => f.merchant)).toEqual(['Tabby statement fee', 'Late payment fee']);
  });
});

describe('price rises', () => {
  const rec = (o: Partial<Transaction>) => tx({ isRecurring: true, category: 'Telecom', ...o });

  it('flags a recurring bill whose latest charge is higher', () => {
    const r = priceRises([
      rec({ merchant: 'du', amount: 299, date: '2026-09-25' }),
      rec({ merchant: 'du', amount: 349, date: '2026-10-25' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: 'du', before: 299, now: 349 });
  });

  it('ignores drops, tiny rises and single charges', () => {
    expect(priceRises([
      rec({ merchant: 'du', amount: 349, date: '2026-09-25' }),
      rec({ merchant: 'du', amount: 299, date: '2026-10-25' }),
      rec({ merchant: 'Rent', category: 'Rent', amount: 4000, date: '2026-09-01' }),
      rec({ merchant: 'Rent', category: 'Rent', amount: 4010, date: '2026-10-01' }), // 0.25%
      rec({ merchant: 'Netflix', amount: 40, date: '2026-10-01' }),
    ])).toEqual([]);
  });
});

describe('left until payday with recurring bills', () => {
  const bank: Account = { id: 'bank', name: 'ENBD Debit', type: 'debit', balance: 3_000, currency: 'AED', icon: '💳' };
  const card: Account = { id: 'card', name: 'ENBD Card', type: 'credit', balance: 10_000, currency: 'AED', icon: '🏦', creditLimit: 18_000, dueDate: 10, statementTotalDue: 1_000, statementDueOn: '2026-11-10' };
  const rec = (o: Partial<Transaction>) => tx({ isRecurring: true, ...o });

  it('subtracts cash bills due before payday, not card ones or ones after payday', () => {
    const r = leftUntilPayday([bank, card], new Date(2026, 10, 28), now, [
      rec({ merchant: 'du', amount: 299, date: '2026-10-15' }),            // next 15 Nov: counted
      rec({ merchant: 'du', amount: 299, date: '2026-09-15' }),            // older row of same bill
      rec({ merchant: 'Netflix', amount: 40, date: '2026-10-20', accountId: 'card' }), // on the card
      rec({ merchant: 'Rent', category: 'Rent', amount: 1_500, date: '2026-10-29' }), // next 29 Nov: after payday
    ]);
    expect(r.cardsDue).toBe(1_000);
    expect(r.billsDue).toBe(299);
    expect(r.bills.map(b => b.name)).toEqual(['du']);
    expect(r.left).toBe(1_701);
  });

  it('a bill already logged this cycle moves to next month', () => {
    const r = leftUntilPayday([bank], new Date(2026, 10, 28), now, [
      rec({ merchant: 'Gym', category: 'Fitness', amount: 350, date: '2026-11-03' }), // next 3 Dec
    ]);
    expect(r.billsDue).toBe(0);
  });
});
