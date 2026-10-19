import { describe, it, expect } from 'vitest';
import type { Account, Transaction } from '@/types/finance';
import { upcomingBills } from '@/lib/finance/upcomingBills';

const now = new Date(2026, 9, 19, 15, 30); // 19 Oct 2026, mid-afternoon

const acct = (o: Partial<Account>): Account => ({
  id: o.name ?? 'x', name: 'x', type: 'credit', balance: 0, currency: 'AED', icon: '🏦', ...o,
});
const enbd = acct({ name: 'ENBD', balance: 16_645.85, dueDate: 10, statementTotalDue: 5_681.98, statementMinDue: 1_287.38, statementDueOn: '2026-11-10' });
const tabby = acct({ name: 'Tabby Card', balance: 1_191.18, dueDate: 12, statementTotalDue: 198.53, statementDueOn: '2026-11-12' });

let n = 0;
const tx = (o: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, type: 'expense', amount: 0, currency: 'AED', category: 'Telecom', categoryIcon: '📱',
  merchant: 'x', accountId: 'Bank', date: '2026-09-25', isRecurring: true, ...o,
});

describe('upcoming bills', () => {
  it('bills a card for its statement total, not its whole balance', () => {
    const [bill] = upcomingBills([enbd], [], now);
    expect(bill.amount).toBe(5_681.98); // not 16,645.85
    expect(bill.dueDate).toEqual(new Date(2026, 10, 10));
    expect(bill.daysLeft).toBe(22);
  });

  it('leaves out cards with no upcoming statement', () => {
    const noStatement = acct({ name: 'Mashreq', balance: 1_800, dueDate: 20 });
    const passed = { ...tabby, statementDueOn: '2026-10-12' };
    expect(upcomingBills([noStatement, passed], [], now)).toEqual([]);
  });

  it('lists recurring expenses due in the next 30 days, soonest first', () => {
    const du = tx({ merchant: 'du', amount: 299, date: '2026-09-25' });
    const gym = tx({ merchant: 'Gym', amount: 350, date: '2026-08-01', category: 'Fitness' }); // next 1 Nov
    const bills = upcomingBills([enbd, tabby], [du, gym], now);
    expect(bills.map(b => b.name)).toEqual(['du', 'Gym', 'ENBD', 'Tabby Card']);
    expect(bills[0].dueDate).toEqual(new Date(2026, 9, 25));
  });

  it("doesn't repeat card instalments the statement already includes", () => {
    const amazon = tx({ merchant: '[Tabby] Amazon', amount: 198.53, date: '2026-08-12', accountId: 'Tabby Card', isTrackingOnly: true, totalInstallments: 4, currentInstallment: 3 });
    expect(upcomingBills([tabby], [amazon], now).map(b => b.name)).toEqual(['Tabby Card']);
  });

  it('skips internal movements and income', () => {
    const transfer = tx({ merchant: 'To savings', isInternal: true, date: '2026-09-25' });
    const salary = tx({ merchant: 'Salary', type: 'income', date: '2026-09-25' });
    expect(upcomingBills([], [transfer, salary], now)).toEqual([]);
  });
});
