// Which rows make one plan, what Delete Plan removes, and what "left" and
// "paid" show as payments are marked paid.
import { describe, it, expect } from 'vitest';
import type { Transaction } from '@/types/finance';
import {
  buildPlans, latestPlanRow, planIdForNewRow, planLeft, planRows, principalAfterProgress, totalLeft,
} from '@/lib/finance/installments';

let n = 0;
const row = (o: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, type: 'expense', amount: 0, currency: 'AED', category: 'Shopping', categoryIcon: '🛍️',
  merchant: 'Tabby', accountId: 'Tabby Card', date: '2026-10-01', isRecurring: true, isTrackingOnly: true,
  totalInstallments: 4, currentInstallment: 0, ...o,
});

describe('two plans at one merchant with the same term', () => {
  // Two Tabby 4-payment orders: 100 with 1 paid (300 left), 250 with 2 paid (500 left).
  const first = row({ amount: 100, currentInstallment: 1, date: '2026-09-10', planId: 'plan-a' });
  const second = row({ amount: 250, currentInstallment: 2, date: '2026-10-05', planId: 'plan-b' });

  it('are two plans and both count in total left', () => {
    const plans = buildPlans([first, second]);
    expect(plans).toHaveLength(2);
    expect(totalLeft(plans)).toBe(800); // was 500: the older plan's 300 disappeared
  });

  it('stay two plans when the rows have no plan id yet', () => {
    const plans = buildPlans([{ ...first, planId: null }, { ...second, planId: undefined }]);
    expect(plans).toHaveLength(2);
    expect(totalLeft(plans)).toBe(800);
  });

  it('stay two plans with the same price when each has its own id', () => {
    const twin = row({ amount: 100, currentInstallment: 1, date: '2026-09-10', planId: 'plan-c' });
    expect(buildPlans([first, twin])).toHaveLength(2);
  });

  it('are split by account when the rows have no plan id', () => {
    const onCard = row({ amount: 100, planId: null });
    const onOtherCard = row({ amount: 100, planId: null, accountId: 'ENBD' });
    expect(buildPlans([onCard, onOtherCard])).toHaveLength(2);
  });

  it('Delete Plan takes only the rows of that plan', () => {
    const all = [first, second];
    const planB = buildPlans(all).find(p => p.planId === 'plan-b')!;
    expect(planRows(all, planB).map(t => t.id)).toEqual([second.id]);
  });

  it('Delete Plan takes only the rows of that plan when the rows have no plan id', () => {
    const all = [{ ...first, planId: null }, { ...second, planId: null }];
    const cheaper = buildPlans(all).find(p => p.amountPerInstallment === 100)!;
    expect(planRows(all, cheaper).map(t => t.id)).toEqual([first.id]);
  });

  it('the stepper writes to the right plan', () => {
    const all = [first, second];
    const planA = buildPlans(all).find(p => p.planId === 'plan-a')!;
    expect(latestPlanRow(all, planA)?.id).toBe(first.id);
  });
});

describe('one plan logged as one row per payment', () => {
  const jan = row({ merchant: 'Car loan', accountId: 'Bank', amount: 900, totalInstallments: 12, currentInstallment: 1, date: '2026-01-05', isTrackingOnly: false, planId: 'loan' });
  const feb = { ...jan, id: 'feb', currentInstallment: 2, date: '2026-02-05' };
  const mar = { accountId: 'Bank', merchant: 'Car loan', amount: 900, totalInstallments: 12, currentInstallment: 3, date: '2026-03-05' };

  it('is one plan at the latest paid count', () => {
    const plans = buildPlans([jan, feb]);
    expect(plans).toHaveLength(1);
    expect(plans[0].paidInstallments).toBe(2);
    expect(planRows([jan, feb], plans[0])).toHaveLength(2);
  });

  it('the next payment joins the plan instead of starting a new one', () => {
    expect(planIdForNewRow([jan, feb], mar, () => 'new')).toBe('loan');
  });

  it('the next payment of a plan without an id gets none, so it stays with its rows', () => {
    const old = [{ ...jan, planId: null }, { ...feb, planId: null }];
    expect(planIdForNewRow(old, mar, () => 'new')).toBeUndefined();
    expect(buildPlans([...old, row({ ...mar, isTrackingOnly: false })])).toHaveLength(1);
  });
});

describe('a new plan gets its own id', () => {
  const open = row({ amount: 100, currentInstallment: 1, date: '2026-09-10', planId: 'plan-a' });
  const base = { accountId: 'Tabby Card', merchant: 'Tabby', totalInstallments: 4, date: '2026-10-01' };

  it('when nothing like it exists', () => {
    expect(planIdForNewRow([], { ...base, amount: 100, currentInstallment: 0 }, () => 'new')).toBe('new');
  });

  it('when it is a second purchase, not a later payment', () => {
    // Different price.
    expect(planIdForNewRow([open], { ...base, amount: 250, currentInstallment: 2 }, () => 'new')).toBe('new');
    // Same price, but not further along than the open plan.
    expect(planIdForNewRow([open], { ...base, amount: 100, currentInstallment: 0 }, () => 'new')).toBe('new');
    expect(planIdForNewRow([open], { ...base, amount: 100, currentInstallment: 1 }, () => 'new')).toBe('new');
    // Same price on another account.
    expect(planIdForNewRow([open], { ...base, accountId: 'ENBD', amount: 100, currentInstallment: 2 }, () => 'new')).toBe('new');
  });

  it('when the matching plan is finished', () => {
    const done = { ...open, currentInstallment: 4 };
    expect(planIdForNewRow([done], { ...base, amount: 100, currentInstallment: 1, date: '2026-12-01' }, () => 'new')).toBe('new');
  });
});

describe('a plan with nothing paid yet', () => {
  it('owes every instalment', () => {
    const [plan] = buildPlans([row({ amount: 100, currentInstallment: 0 })]);
    expect(plan.paidInstallments).toBe(0);
    expect(plan.paidAmount).toBe(0);
    expect(planLeft(plan)).toBe(400);
  });
});

describe('only expenses are plans', () => {
  it('a recurring income saved with instalment fields is not a debt', () => {
    const salary = row({ type: 'income', merchant: 'Salary', amount: 10_000, totalInstallments: 12, currentInstallment: 1, isTrackingOnly: false });
    expect(buildPlans([salary])).toEqual([]);
  });
});

describe('"left" moves when payments are marked paid', () => {
  // 12 x 110, remaining principal typed as 1,200 with nothing paid.
  const loan = row({ merchant: 'Loan', amount: 110, totalInstallments: 12, currentInstallment: 0, remainingPrincipal: 1_200 });
  // What the +/- stepper on Installments writes.
  const tap = (tx: Transaction, delta: number): Transaction => {
    const paid = tx.currentInstallment ?? 0;
    return {
      ...tx,
      currentInstallment: paid + delta,
      remainingPrincipal: principalAfterProgress(tx.remainingPrincipal, tx.totalInstallments!, paid, paid + delta),
    };
  };

  it('each payment takes its share off the typed principal', () => {
    let tx = loan;
    for (let i = 0; i < 5; i++) tx = tap(tx, +1);
    expect(tx.currentInstallment).toBe(5);
    expect(planLeft(buildPlans([tx])[0])).toBe(700); // was 1,200 however many were paid
  });

  it('stepping back puts the share back', () => {
    expect(tap(tap(loan, +1), -1).remainingPrincipal).toBe(1_200);
  });

  it('the last payment leaves nothing', () => {
    let tx = loan;
    for (let i = 0; i < 12; i++) tx = tap(tx, +1);
    expect(tx.remainingPrincipal).toBe(0);
    expect(planLeft(buildPlans([tx])[0])).toBe(0);
  });

  it('a finished plan stepped back falls back to instalment x months', () => {
    const tx = tap({ ...loan, currentInstallment: 12, remainingPrincipal: 0 }, -1);
    expect(tx.remainingPrincipal).toBeNull();
    expect(planLeft(buildPlans([tx])[0])).toBe(110);
  });

  it('leaves a principal that was never entered alone', () => {
    expect(principalAfterProgress(null, 12, 3, 4)).toBeNull();
    expect(principalAfterProgress(undefined, 12, 3, 4)).toBeUndefined();
  });

  it('a finished plan owes nothing even with a stale typed principal', () => {
    const [plan] = buildPlans([{ ...loan, currentInstallment: 12, remainingPrincipal: 300 }]);
    expect(planLeft(plan)).toBe(0);
  });
});

describe('paid against total compares like with like', () => {
  // 12 x 110 = 1,320 in payments on a 1,200 purchase.
  const withPrice = row({ merchant: 'Loan', amount: 110, totalInstallments: 12, currentInstallment: 11, loanTotalAmount: 1_200 });

  it('with a purchase price: principal paid of the price, never more than it', () => {
    const [plan] = buildPlans([withPrice]);
    expect(plan.totalAmount).toBe(1_200);
    expect(plan.paidAmount).toBe(1_100); // was 1,210 of 1,200
    expect(buildPlans([{ ...withPrice, currentInstallment: 12 }])[0].paidAmount).toBe(1_200);
  });

  it('without one: payments made of payments due', () => {
    const [plan] = buildPlans([{ ...withPrice, loanTotalAmount: null }]);
    expect(plan.totalAmount).toBe(1_320);
    expect(plan.paidAmount).toBe(1_210);
  });
});
