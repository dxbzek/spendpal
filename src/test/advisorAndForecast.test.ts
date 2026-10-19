import { describe, it, expect } from 'vitest';
import type { Account, Transaction } from '@/types/finance';
import type { BudgetAnalysis } from '@/hooks/useAI';
import { buildAdvisorData, isGrounded, presentAnalysis, toSecondPerson } from '@/lib/finance/advisorData';
import { spendingForecast } from '@/lib/finance/spendingForecast';

const now = new Date(2026, 9, 20); // 20 Oct 2026

let n = 0;
const tx = (o: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, type: 'expense', amount: 0, currency: 'AED', category: 'Other', categoryIcon: '📌',
  merchant: 'x', accountId: 'bank', date: '2026-10-05', ...o,
});
const accounts: Account[] = [
  { id: 'bank', name: 'Bank', type: 'debit', balance: 5_212.49, currency: 'AED', icon: '💳' },
  { id: 'ju', name: 'Savings (held by Ju)', type: 'debit', balance: 5_000, currency: 'AED', icon: '💳', excludeFromSpendable: true },
  { id: 'enbd', name: 'ENBD', type: 'credit', balance: 16_645.85, creditLimit: 18_000, currency: 'AED', icon: '🏦', statementMinDue: 1_287.38 },
];

describe('advisor data', () => {
  const rows = [
    tx({ merchant: 'iCloud', category: 'Subscriptions', amount: 22.69, isRecurring: true, date: '2026-10-03' }),
    tx({ merchant: 'iCloud', category: 'Subscriptions', amount: 22.69, isRecurring: true, date: '2026-09-03' }),
    tx({ merchant: 'iCloud', category: 'Subscriptions', amount: 22.69, isRecurring: true, date: '2026-08-03' }),
    tx({ merchant: 'Adobe', category: 'Software', amount: 210, isRecurring: true, date: '2026-10-04' }),
    // Pass-through and bookkeeping rows that inflated the old figure:
    tx({ merchant: 'ENBD payment', category: 'Subscriptions', amount: 900, isRecurring: true, isInternal: true, date: '2026-10-10' }),
    tx({ merchant: '[CC] Noon laptop', category: 'Shopping', amount: 120, isRecurring: true, isTrackingOnly: true, totalInstallments: 48, currentInstallment: 12, date: '2026-10-10' }),
    tx({ merchant: 'Old gym', category: 'Fitness', amount: 300, isRecurring: true, date: '2026-05-01' }),
  ];
  const data = buildAdvisorData(rows, accounts, [], [], now, 'AED');

  it('gives Subscriptions as this month\'s Subscriptions category only', () => {
    expect(data.subscriptionsThisMonth).toBe(22.69); // not 1,369.72
  });

  it('leaves internal and tracking-only rows out of every figure', () => {
    expect(data.monthlyExpenses).toBe(232.69);
    expect(data.categories.map(c => c.name).sort()).toEqual(['Software', 'Subscriptions']);
  });

  it('lists each recurring merchant once, recent ones only, no instalments', () => {
    expect(data.recurringExpenses).toEqual([
      { merchant: 'iCloud', amount: 22.69, category: 'Subscriptions' },
      { merchant: 'Adobe', amount: 210, category: 'Software' },
    ]);
  });

  it('counts spendable cash without savings set aside', () => {
    expect(data.spendableCash).toBe(5_212.49);
  });

  it('writes to you, not about "the user"', () => {
    expect(toSecondPerson("The user's savings ratio is negative.")).toBe('Your savings ratio is negative.');
    expect(toSecondPerson('The user has 3 cards and the user is over budget.')).toBe('You have 3 cards and you are over budget.');
  });

  it('keeps advice that names your data and drops generic tips', () => {
    expect(isGrounded('Adobe costs 210 a month; check you still use it', data)).toBe(true);
    expect(isGrounded('Your spending this month is 232.69', data)).toBe(true);
    expect(isGrounded('Increase income by 10%', data)).toBe(false);
    expect(isGrounded('Build an emergency fund of 3 months', data)).toBe(false);

    const analysis = {
      methodReason: "The user's software spend is high.",
      insights: [
        { type: 'warning', title: 'Software', description: 'Software is 210 this month.' },
        { type: 'suggestion', title: 'Earn more', description: 'Increase income by 10%.' },
      ],
      dynamicAdjustments: [{ action: 'Cut Adobe', impact: 'Saves 210/mo' }, { action: 'Save more', impact: 'Big impact' }],
    } as unknown as BudgetAnalysis;
    const shown = presentAnalysis(analysis, data);
    expect(shown.methodReason).toBe('Your software spend is high.');
    expect(shown.insights.map(i => i.title)).toEqual(['Software']);
    expect(shown.dynamicAdjustments.map(a => a.action)).toEqual(['Cut Adobe']);
  });
});

describe('spending forecast', () => {
  // October to the 20th: everyday spend at 60/day, plus a 6,000 trip, rent and an internal card payment.
  const october = [
    ...Array.from({ length: 20 }, (_, i) => tx({ amount: 60, category: 'Groceries', date: `2026-10-${String(i + 1).padStart(2, '0')}` })),
    tx({ amount: 6_000, category: 'Travel', merchant: 'flydubai', date: '2026-10-06' }),
    tx({ amount: 4_200, category: 'Rent', merchant: 'Landlord', isRecurring: true, date: '2026-10-01' }),
    tx({ amount: 3_000, merchant: 'Card payment', isInternal: true, date: '2026-10-11' }),
  ];
  // September/August everyday spend: 50/day and 70/day; a recurring bill on the 25th.
  const sep = [...Array.from({ length: 30 }, (_, i) => tx({ amount: 50, date: `2026-09-${String(i + 1).padStart(2, '0')}` })),
    tx({ amount: 299, merchant: 'du', category: 'Telecom', isRecurring: true, date: '2026-09-25' })];
  const aug = Array.from({ length: 31 }, (_, i) => tx({ amount: 70, date: `2026-08-${String(i + 1).padStart(2, '0')}` }));

  it('adds the everyday rate and recurring bills still due, not the trip', () => {
    const f = spendingForecast([...october, ...sep, ...aug], now)!;
    expect(f.spentSoFar).toBe(20 * 60 + 6_000 + 4_200); // 11,400; internal row left out
    // Old straight line: 11,400 / 20 × 31 = 17,670.
    expect(f.everydayPerDay).toBeCloseTo(60, 5);
    expect(f.recurringStillDue).toBe(299);
    expect(f.projected).toBe(Math.round(11_400 + 11 * 60 + 299)); // 12,359
    expect(f.low).toBe(Math.round(11_400 + 11 * 50 + 299));
    expect(f.high).toBe(Math.round(11_400 + 11 * 70 + 299));
    expect(f.oneOffs).toEqual({ count: 1, total: 6_000 });
  });

  it('says nothing before day 10', () => {
    expect(spendingForecast(october, new Date(2026, 9, 9))).toBeNull();
  });
});
