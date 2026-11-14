import { describe, it, expect } from 'vitest';
import type { Transaction } from '@/types/finance';
import { openPlansByAccount, planPrincipalLeft, splitOwedByPlans } from '@/lib/finance/debtPlans';

let n = 0;
const row = (o: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, type: 'expense', amount: 0, currency: 'AED', category: 'Shopping', categoryIcon: '🛍️',
  merchant: 'x', accountId: 'card', date: '2026-01-01', isRecurring: true, isTrackingOnly: true, ...o,
});

// A 0% plan with 2 of 4 left, a long plan with the principal typed from the
// statement, a finished plan, a plan on another card, and a plan that posts
// each instalment to the balance.
const phone = row({ merchant: '[CC] Phone', amount: 250, totalInstallments: 4, currentInstallment: 2 });
const laptop = row({ merchant: '[CC] Laptop', amount: 150, totalInstallments: 48, currentInstallment: 6, remainingPrincipal: 4_200.5 });
const done = row({ merchant: '[CC] Sofa', amount: 100, totalInstallments: 12, currentInstallment: 12 });
const other = row({ merchant: '[Tabby] Shoes', accountId: 'tabby', amount: 80, totalInstallments: 4, currentInstallment: 1 });
const posting = row({ merchant: 'Gym', amount: 185, totalInstallments: 4, currentInstallment: 1, isTrackingOnly: false });
const plain = row({ merchant: 'Groceries', amount: 60, isRecurring: false });

describe('openPlansByAccount', () => {
  const plans = openPlansByAccount([phone, laptop, done, other, posting, plain]);

  it('groups open plans by the card they are billed to', () => {
    expect(plans.card.map(p => p.merchant).sort()).toEqual(['[CC] Laptop', '[CC] Phone']);
    expect(plans.tabby.map(p => p.merchant)).toEqual(['[Tabby] Shoes']);
  });

  it('leaves out a finished plan', () => {
    expect(plans.card.some(p => p.merchant === '[CC] Sofa')).toBe(false);
  });

  it('leaves out a plan that posts each instalment: its remainder is not in the balance yet', () => {
    expect(plans.card.some(p => p.merchant === 'Gym')).toBe(false);
  });
});

describe('planPrincipalLeft', () => {
  const only = (t: Transaction) => openPlansByAccount([t])[t.accountId][0];

  it('uses the remaining principal typed from the statement', () => {
    expect(planPrincipalLeft(only(laptop))).toBe(4_200.5); // not 42 x 150 = 6,300
  });

  it('is instalment x instalments left for a plan with nothing else entered', () => {
    expect(planPrincipalLeft(only(phone))).toBe(500);
  });

  it('takes a straight-line share of the item price when that was entered', () => {
    // 1,200 item, 12 instalments of 110 (interest inside). 9 left: 900 of
    // principal, not 9 x 110 = 990. Same as the Installments page.
    const tv = row({ merchant: '[CC] TV', amount: 110, totalInstallments: 12, currentInstallment: 3, loanTotalAmount: 1_200 });
    expect(planPrincipalLeft(only(tv))).toBe(900);
  });
});

// Regression: the Debt page treated the whole balance as card debt at the
// card APR, instalment plan principal included.
describe('splitOwedByPlans', () => {
  const plans = openPlansByAccount([phone, laptop, done, posting]).card;

  it('takes plan principal out of the revolving amount', () => {
    // Phone: 2 x 250 = 500. Laptop: 4,200.50 from the statement, not 42 x 150.
    expect(splitOwedByPlans(9_000, plans)).toEqual({ inPlans: 4_700.5, revolving: 4_299.5, planMonthly: 400 });
  });

  it('is all revolving for a card with no plans', () => {
    expect(splitOwedByPlans(9_000, [])).toEqual({ inPlans: 0, revolving: 9_000, planMonthly: 0 });
  });

  it('is all plan principal for a pay-later account that holds nothing else', () => {
    const tabby = openPlansByAccount([other]).tabby; // 3 x 80 = 240
    expect(splitOwedByPlans(240, tabby)).toEqual({ inPlans: 240, revolving: 0, planMonthly: 80 });
  });
});
