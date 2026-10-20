import { describe, it, expect } from 'vitest';
import type { Account } from '@/types/finance';
import { cardStatus, cardStatuses, leftUntilPayday, nextPayday, inferPayday } from '@/lib/finance/cardPayments';

// Today's real figures (17 Oct 2026).
const now = new Date(2026, 9, 17);

const acct = (o: Partial<Account>): Account => ({
  id: o.name ?? 'x', name: 'x', type: 'debit', balance: 0, currency: 'AED', icon: '💳', ...o,
});

const enbd = acct({
  name: 'ENBD', type: 'credit', balance: 17_800, creditLimit: 25_000,
  statementTotalDue: 5_681.98, statementMinDue: 1_287.38, statementDueOn: '2026-11-10',
});
const tabby = acct({
  name: 'Tabby Card', type: 'credit', balance: 1_191.18, creditLimit: 2_500,
  statementTotalDue: 198.53, statementMinDue: null, statementDueOn: '2026-11-12',
});
// Debit + cash accounts adding up to 5,347.49.
const bank = acct({ name: 'Bank', type: 'debit', balance: 5_212.49 });
const cash = acct({ name: 'Cash', type: 'cash', balance: 135 });
const accounts = [bank, cash, enbd, tabby];

describe('card payments come from the statement fields, never a guess', () => {
  it('shows ENBD exactly as the statement says', () => {
    const s = cardStatus(enbd, now);
    expect(s.kind).toBe('due');
    if (s.kind !== 'due') return;
    expect(s.total).toBe(5_681.98);
    expect(s.min).toBe(1_287.38);
    expect(s.dueOn).toEqual(new Date(2026, 10, 10));
  });

  it('shows Tabby Card exactly as Tabby says', () => {
    const s = cardStatus(tabby, now);
    expect(s.kind).toBe('due');
    if (s.kind !== 'due') return;
    expect(s.total).toBe(198.53);
    expect(s.min).toBeNull();
    expect(s.dueOn).toEqual(new Date(2026, 10, 12));
  });

  it('asks for the statement instead of inventing an amount', () => {
    expect(cardStatus(acct({ name: 'New card', type: 'credit', balance: 4_000 }), now).kind).toBe('missing');
    // A total without a due date (or the reverse) is incomplete, so still missing.
    expect(cardStatus({ ...enbd, statementDueOn: null }, now).kind).toBe('missing');
    expect(cardStatus({ ...enbd, statementTotalDue: null }, now).kind).toBe('missing');
  });

  it('flags a statement whose due date has passed', () => {
    expect(cardStatus(enbd, new Date(2026, 10, 11)).kind).toBe('passed');
    expect(cardStatus(enbd, new Date(2026, 10, 10)).kind).toBe('due'); // due today
  });

  it('lists only credit cards, soonest due first', () => {
    expect(cardStatuses(accounts, now).map(s => s.account.name)).toEqual(['ENBD', 'Tabby Card']);
  });

  it('leaves out a personal debt: a credit account with no limit and no due day', () => {
    const owed = { ...accounts.find(a => a.type === 'credit')!, id: 'ju', name: 'Owed to Ju (Georgia trip)', creditLimit: undefined, dueDate: undefined, statementTotalDue: undefined, statementDueOn: undefined };
    expect(cardStatuses([...accounts, owed], now).map(s => s.account.name)).not.toContain('Owed to Ju (Georgia trip)');
  });
});

describe('left until payday', () => {
  it('is cash minus statements due before payday: 5,347.49 - 5,681.98 = -334.49', () => {
    // Payday on the 12th: ENBD (10 Nov) falls before it, Tabby (12 Nov) is paid from that salary.
    const r = leftUntilPayday(accounts, new Date(2026, 10, 12), now);
    expect(r.cash).toBe(5_347.49);
    expect(r.due).toBe(5_681.98);
    expect(r.left).toBe(-334.49);
    expect(r.perDay).toBeNull(); // never a per-day allowance when negative
  });

  it('counts every statement due before payday', () => {
    const r = leftUntilPayday(accounts, new Date(2026, 10, 15), now);
    expect(r.due).toBe(5_880.51);
    expect(r.left).toBe(-533.02);
    expect(r.perDay).toBeNull();
  });

  it('ignores statements due after payday and ones already past', () => {
    const early = leftUntilPayday(accounts, new Date(2026, 9, 28), now);
    expect(early.left).toBe(5_347.49);
    expect(early.perDay).toBe(486.13); // 5,347.49 over 11 days, rounded down
    const passed = leftUntilPayday([bank, cash, { ...enbd, statementDueOn: '2026-10-10' }], new Date(2026, 10, 12), now);
    expect(passed.due).toBe(0);
  });

  it("leaves out savings that aren't spendable", () => {
    // "Savings (held by Ju)": 5,000 that isn't ours to spend.
    const ju = acct({ name: 'Savings (held by Ju)', type: 'debit', balance: 5_000, excludeFromSpendable: true });
    const r = leftUntilPayday([...accounts, ju], new Date(2026, 10, 12), now);
    expect(r.cash).toBe(5_347.49);
    expect(r.left).toBe(-334.49);
    // Without the flag it would wrongly cover the card.
    expect(leftUntilPayday([...accounts, { ...ju, excludeFromSpendable: false }], new Date(2026, 10, 12), now).left).toBe(4_665.51);
  });

  it('finds the next payday after today', () => {
    expect(nextPayday(12, now)).toEqual(new Date(2026, 10, 12));
    expect(nextPayday(28, now)).toEqual(new Date(2026, 9, 28));
    expect(nextPayday(17, now)).toEqual(new Date(2026, 10, 17)); // today is not "next"
    expect(nextPayday(31, new Date(2026, 1, 1))).toEqual(new Date(2026, 1, 28));
  });

  it('reads payday from the latest salary', () => {
    expect(inferPayday([
      { type: 'income', category: 'Salary', date: '2026-09-12' },
      { type: 'income', category: 'Salary', date: '2026-10-12' },
      { type: 'income', category: 'Gift', date: '2026-10-15' },
    ])).toBe(12);
    expect(inferPayday([])).toBeNull();
  });
});

describe('ordinal', () => {
  it('uses the right suffix for due days', async () => {
    const { ordinal } = await import('@/lib/ordinal');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st'],
    );
  });
});
