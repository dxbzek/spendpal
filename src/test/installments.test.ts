import { describe, it, expect } from 'vitest';
import type { Account, Transaction } from '@/types/finance';
import {
  buildPlans, planDisplayName, planLeft, planSchedule, totalLeft, nextInstallmentDue,
} from '@/lib/finance/installments';

const now = new Date(2026, 9, 19); // 19 Oct 2026

const acct = (o: Partial<Account>): Account => ({
  id: o.name ?? 'x', name: 'x', type: 'credit', balance: 0, currency: 'AED', icon: '🏦', ...o,
});
const enbd = acct({ name: 'ENBD', dueDate: 10, statementDueOn: '2026-11-10', statementTotalDue: 5_681.98 });
const tabby = acct({ name: 'Tabby Card', dueDate: 12, statementDueOn: '2026-11-12', statementTotalDue: 198.53 });

let n = 0;
const row = (o: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, type: 'expense', amount: 0, currency: 'AED', category: 'Shopping', categoryIcon: '🛍️',
  merchant: 'x', accountId: 'ENBD', date: '2026-01-01', isRecurring: true, isTrackingOnly: true, ...o,
});

// Logged when bought (12 Aug); 3 of 4 marked paid since.
const amazon = row({ merchant: '[Tabby] Amazon', accountId: 'Tabby Card', amount: 198.53, totalInstallments: 4, currentInstallment: 3, date: '2026-08-12' });
const laptop = row({ merchant: '[CC] Noon laptop', amount: 120, totalInstallments: 48, currentInstallment: 12, date: '2025-10-10', remainingPrincipal: 3_346.79 });
const sofa = row({ merchant: '[CC] Home Centre', amount: 160, totalInstallments: 48, currentInstallment: 6, date: '2026-04-10', remainingPrincipal: 5_357.83 });
const plans = buildPlans([amazon, laptop, sofa]);
const plan = (name: string) => plans.find(p => planDisplayName(p.merchant) === name)!;

describe('installment end dates follow the card, not the row date', () => {
  it('Tabby Amazon 4 of 4 is due 12 Nov 2026 (the old maths said Sep 2026)', () => {
    const s = planSchedule(plan('Amazon'), tabby, now)!;
    expect(s.nextDue).toEqual(new Date(2026, 10, 12));
    expect(s.endsOn).toEqual(new Date(2026, 10, 12));
    expect(s.startedOn).toEqual(new Date(2026, 7, 12));
  });

  it('a 48-month plan ends 47 instalments after the next one', () => {
    const s = planSchedule(plan('Home Centre'), enbd, now)!;
    expect(s.nextDue).toEqual(new Date(2026, 10, 10));
    expect(s.endsOn).toEqual(new Date(2030, 3, 10)); // 42 left: Nov 2026 + 41 months
  });

  it('uses the due day once the statement date has passed', () => {
    const passed = { ...tabby, statementDueOn: '2026-10-12' };
    expect(nextInstallmentDue(plan('Amazon'), passed, now)).toEqual(new Date(2026, 10, 12));
    expect(nextInstallmentDue(plan('Amazon'), passed, new Date(2026, 9, 12))).toEqual(new Date(2026, 9, 12));
  });

  it("falls back to the row's day of month when the account has no due dates", () => {
    expect(nextInstallmentDue(plan('Amazon'), undefined, now)).toEqual(new Date(2026, 10, 12));
  });

  it('keeps a 31st due day after short months', () => {
    const p = { ...plan('Amazon'), paidInstallments: 0 };
    const card = acct({ name: 'C', dueDate: 31 });
    const s = planSchedule(p, card, new Date(2026, 10, 5))!;
    expect(s.nextDue).toEqual(new Date(2026, 10, 30));
    expect(s.endsOn).toEqual(new Date(2027, 1, 28));
    expect(planSchedule({ ...p, paidInstallments: 1 }, card, new Date(2026, 10, 5))!.endsOn).toEqual(new Date(2027, 0, 31));
  });

  it('has no schedule once every instalment is paid', () => {
    expect(planSchedule({ ...plan('Amazon'), paidInstallments: 4 }, tabby, now)).toBeNull();
  });
});

describe('total left uses the statement principal when it is set', () => {
  it('per plan', () => {
    expect(planLeft(plan('Noon laptop'))).toBe(3_346.79); // not 36 × 120 = 4,320
    expect(planLeft(plan('Home Centre'))).toBe(5_357.83); // not 42 × 160 = 6,720
    expect(planLeft(plan('Amazon'))).toBe(198.53); // no principal entered: EMI × 1 left
  });

  it('summed over active plans', () => {
    expect(totalLeft(plans)).toBe(8_903.15);
    const noPrincipal = buildPlans([amazon, { ...laptop, remainingPrincipal: null }, { ...sofa, remainingPrincipal: undefined }]);
    expect(totalLeft(noPrincipal)).toBe(11_238.53);
  });

  it('leaves finished plans out', () => {
    const done = buildPlans([{ ...amazon, currentInstallment: 4 }]);
    expect(totalLeft(done)).toBe(0);
  });
});

describe('plan names', () => {
  it('drop the [CC] / [Tabby] prefix', () => {
    expect(planDisplayName('[Tabby] Amazon')).toBe('Amazon');
    expect(planDisplayName('[CC]Noon laptop')).toBe('Noon laptop');
    expect(planDisplayName('Amazon [gift]')).toBe('Amazon [gift]');
    expect(planDisplayName('[CC]')).toBe('[CC]');
  });

  it('keep the account the plan is billed to', () => {
    expect(plan('Amazon').accountId).toBe('Tabby Card');
  });
});
