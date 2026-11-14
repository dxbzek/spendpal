import { describe, it, expect } from 'vitest';
import type { Account, Transaction } from '@/types/finance';
import {
  defaultAccountId, defaultPaidInstallments, isPlanForm, paidInstallmentsFrom, planFields, setRecurring,
} from '@/lib/finance/transactionForm';
import { buildPlans, totalLeft } from '@/lib/finance/installments';
import { nextRecurringBills } from '@/lib/finance/recurringBills';

// The form as it opens: both switches off, the instalment fields at their defaults.
const fresh = { isRecurring: false, hasInstallments: false };
const fields = { type: 'expense' as const, totalInstallments: '12', currentInstallment: '1', loanTotalAmount: '', isTrackingOnly: false };

describe('the Recurring switch', () => {
  it('on: a recurring bill, not an instalment plan', () => {
    const switches = setRecurring(fresh, true);
    expect(switches).toEqual({ isRecurring: true, hasInstallments: false }); // was hasInstallments: true
    expect(planFields({ ...fields, ...switches })).toEqual({
      totalInstallments: undefined, currentInstallment: undefined, loanTotalAmount: undefined, isTrackingOnly: false,
    });
  });

  it('a 20/month subscription saved with Recurring on is a bill with no debt', () => {
    const switches = setRecurring(fresh, true);
    const saved: Transaction = {
      id: 't1', type: 'expense', amount: 20, currency: 'AED', category: 'Subscriptions', categoryIcon: 'x',
      merchant: 'Spotify', accountId: 'Bank', date: '2026-11-01', isRecurring: switches.isRecurring,
      ...planFields({ ...fields, ...switches }),
    };
    const bank: Account = { id: 'Bank', name: 'Bank', type: 'debit', balance: 1_000, currency: 'AED', icon: 'x' };
    expect(buildPlans([saved])).toEqual([]); // was 1 plan
    expect(totalLeft(buildPlans([saved]))).toBe(0); // was 220 "left"
    expect(nextRecurringBills([bank], [saved], new Date(2026, 10, 14)).map(b => b.name)).toEqual(['Spotify']); // was no bill
  });

  it('off: Installment Plan goes off with it', () => {
    expect(setRecurring({ isRecurring: true, hasInstallments: true }, false)).toEqual(fresh);
  });

  it('on again keeps a plan that was switched on by "New Plan"', () => {
    expect(setRecurring({ isRecurring: false, hasInstallments: true }, true)).toEqual({ isRecurring: true, hasInstallments: true });
  });
});

describe('what makes a row an instalment plan', () => {
  it('an expense with Recurring and Installment Plan both on', () => {
    expect(isPlanForm('expense', { isRecurring: true, hasInstallments: true })).toBe(true);
    expect(isPlanForm('expense', { isRecurring: true, hasInstallments: false })).toBe(false);
    expect(isPlanForm('expense', { isRecurring: false, hasInstallments: true })).toBe(false);
  });

  it('never income: a recurring salary is not a debt', () => {
    expect(isPlanForm('income', { isRecurring: true, hasInstallments: true })).toBe(false);
    expect(planFields({ ...fields, type: 'income', isRecurring: true, hasInstallments: true }).totalInstallments).toBeUndefined();
  });

  it('saves the plan fields as typed', () => {
    expect(planFields({ ...fields, isRecurring: true, hasInstallments: true, totalInstallments: '4', currentInstallment: '2', loanTotalAmount: '750', isTrackingOnly: true }))
      .toEqual({ totalInstallments: 4, currentInstallment: 2, loanTotalAmount: 750, isTrackingOnly: true });
  });
});

describe('installments paid so far', () => {
  it('0 is saved as 0', () => {
    expect(paidInstallmentsFrom('0', 12)).toBe(0);
    expect(planFields({ ...fields, isRecurring: true, hasInstallments: true, currentInstallment: '0' }).currentInstallment).toBe(0);
  });

  it('stays between 0 and the total', () => {
    expect(paidInstallmentsFrom('13', 12)).toBe(12);
    expect(paidInstallmentsFrom('-1', 12)).toBe(0);
    expect(paidInstallmentsFrom('', 12)).toBe(0);
    expect(paidInstallmentsFrom('5', 12)).toBe(5);
  });

  it('a plan with 0 paid owes every instalment', () => {
    const saved: Transaction = {
      id: 't1', type: 'expense', amount: 100, currency: 'AED', category: 'Shopping', categoryIcon: 'x',
      merchant: 'Tabby', accountId: 'Tabby Card', date: '2026-11-01', isRecurring: true,
      ...planFields({ ...fields, isRecurring: true, hasInstallments: true, totalInstallments: '4', currentInstallment: '0', isTrackingOnly: true }),
    };
    const [plan] = buildPlans([saved]);
    expect(plan.paidInstallments).toBe(0);
    expect(totalLeft([plan])).toBe(400); // the form used to refuse 0 and save 1: 300
  });

  it('starts at 1 for a plan paid from cash, 0 for one tracked on a card', () => {
    expect(defaultPaidInstallments(false)).toBe(1);
    expect(defaultPaidInstallments(true)).toBe(0);
  });
});

describe('the account the form opens with', () => {
  it('the only account is selected', () => {
    expect(defaultAccountId([{ id: 'a' }])).toBe('a');
  });

  it('with none or several, nothing is selected and the user picks', () => {
    expect(defaultAccountId([])).toBe('');
    expect(defaultAccountId([{ id: 'a' }, { id: 'b' }])).toBe('');
  });
});
