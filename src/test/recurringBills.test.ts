// One bill per merchant + category in the four places that read recurring
// rows: Upcoming Bills, Recurring Expenses, the "not logged" banner and the
// Accounts 30-day projection.
import { describe, it, expect } from 'vitest';
import type { Account, Transaction } from '@/types/finance';
import {
  activeRecurring, monthlyRecurringTotal, nextDueDate, nextRecurringBills, notLoggedThisMonth,
} from '@/lib/finance/recurringBills';
import { upcomingBills } from '@/lib/finance/upcomingBills';
import { projectBalance } from '@/lib/finance/balanceProjection';

const now = new Date(2026, 9, 25, 15, 30); // 25 Oct 2026, mid-afternoon

const acct = (o: Partial<Account>): Account => ({
  id: o.name ?? 'x', name: 'x', type: 'debit', balance: 0, currency: 'AED', icon: 'x', ...o,
});
const bank = acct({ name: 'Bank', balance: 5_000 });
const card = acct({ name: 'Card', type: 'credit', balance: 900 });

let n = 0;
const tx = (o: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, type: 'expense', amount: 0, currency: 'AED', category: 'Subscriptions', categoryIcon: 'x',
  merchant: 'x', accountId: 'Bank', date: '2026-10-20', isRecurring: true, ...o,
});

// Netflix logged two months running, as the banner asks; the gym once.
const netflixSep = tx({ merchant: 'Netflix', amount: 45, date: '2026-09-20' });
const netflixOct = tx({ merchant: 'Netflix', amount: 50, date: '2026-10-20' });
const gym = tx({ merchant: 'Gym', amount: 200, category: 'Fitness', date: '2026-10-01' });
// A card instalment and a cash instalment plan: the Installments page owns both.
const tabby = tx({ merchant: '[Tabby] Amazon', amount: 198.53, accountId: 'Card', isTrackingOnly: true, totalInstallments: 4, currentInstallment: 3, date: '2026-10-12' });
const carLoan = tx({ merchant: 'Car loan', amount: 900, totalInstallments: 12, currentInstallment: 2, date: '2026-10-05' });
// Cancelled in June.
const oldGym = tx({ merchant: 'Old gym', amount: 300, category: 'Fitness', date: '2026-06-01' });
const all = [netflixSep, netflixOct, gym, tabby, carLoan, oldGym];

describe('running bills', () => {
  it('are one per merchant + category, at the latest amount', () => {
    const bills = activeRecurring(all, now);
    expect(bills.map(b => b.merchant).sort()).toEqual(['Gym', 'Netflix']);
    expect(bills.find(b => b.merchant === 'Netflix')!.amount).toBe(50);
  });

  it('treat the same merchant typed with other spacing or case as one bill', () => {
    const again = tx({ merchant: ' netflix ', amount: 55, date: '2026-10-22' });
    expect(activeRecurring([netflixOct, again], now)).toHaveLength(1);
  });

  it('drop a bill not logged for 3 months, keep one logged just inside that', () => {
    expect(activeRecurring([tx({ merchant: 'A', date: '2026-07-24' })], now)).toEqual([]);
    expect(activeRecurring([tx({ merchant: 'A', date: '2026-07-25' })], now)).toHaveLength(1);
  });

  it('leave out internal movements', () => {
    expect(activeRecurring([tx({ merchant: 'To savings', isInternal: true })], now)).toEqual([]);
  });
});

describe('Upcoming Bills', () => {
  it('lists a bill logged in two months once, on its next date', () => {
    const bills = upcomingBills([bank], [netflixSep, netflixOct, gym], now);
    expect(bills.map(b => b.name)).toEqual(['Gym', 'Netflix']); // was Gym, Netflix, Netflix
    expect(bills[1].amount).toBe(50);
    expect(bills[1].dueDate).toEqual(new Date(2026, 10, 20));
  });

  it('leaves out instalment plans and stopped bills', () => {
    expect(upcomingBills([bank], all, now).map(b => b.name)).toEqual(['Gym', 'Netflix']);
  });
});

describe('Recurring Expenses on Home', () => {
  it('Monthly Commitment counts each bill once', () => {
    // Every row summed gave 45 + 50 + 200 + 198.53 + 900 + 300.
    expect(monthlyRecurringTotal(activeRecurring(all, now))).toBe(250);
  });

  it('does not grow when the same bill is logged again next month', () => {
    const nov = new Date(2026, 10, 25);
    const netflixNov = tx({ merchant: 'Netflix', amount: 50, date: '2026-11-20' });
    const gymNov = tx({ merchant: 'Gym', amount: 200, category: 'Fitness', date: '2026-11-01' });
    expect(monthlyRecurringTotal(activeRecurring([...all, netflixNov, gymNov], nov))).toBe(250);
  });

  it('shows the real next date, today or later', () => {
    // Logged 1 Aug and not since: the next one is 1 Nov, not 1 Sep.
    expect(nextDueDate('2026-08-01', now)).toEqual(new Date(2026, 10, 1));
    expect(nextDueDate('2026-09-25', now)).toEqual(new Date(2026, 9, 25)); // due today counts
    expect(nextDueDate('2026-01-31', new Date(2026, 1, 1))).toEqual(new Date(2026, 1, 28));
  });
});

describe('"not logged this month" banner', () => {
  it('asks for a bill whose latest row is from an earlier month', () => {
    const rent = tx({ merchant: 'Rent', amount: 4_000, category: 'Rent', date: '2026-09-01' });
    expect(notLoggedThisMonth([...all, rent], now).map(t => t.merchant)).toEqual(['Rent']);
  });

  it('does not ask for instalment plans or bills stopped months ago', () => {
    // tabby and carLoan are dated this month here, so move them back.
    const plans = [{ ...tabby, date: '2026-09-12' }, { ...carLoan, date: '2026-09-05' }];
    expect(notLoggedThisMonth([...plans, oldGym], now)).toEqual([]); // was 3 "not logged"
  });

  it('is quiet once the bill is logged this month', () => {
    expect(notLoggedThisMonth([netflixSep, netflixOct], now)).toEqual([]);
  });
});

describe('Accounts 30-day projection', () => {
  it('takes each bill off once, however many months it was logged', () => {
    const months = ['04', '05', '06', '07', '08', '09'];
    const netflix = months.map(m => tx({ merchant: 'Netflix', amount: 50, date: `2026-${m}-28` }));
    const p = projectBalance([bank], netflix, now)!;
    expect(p.startBalance).toBe(5_000);
    expect(p.endBalance).toBe(4_950); // was 4,700: six rows, six deductions
    expect(p.change).toBe(-50);
    // Latest row is 28 Sep, so the next one is 28 Oct: day 3.
    expect(p.points[2].balance).toBe(5_000);
    expect(p.points[3].balance).toBe(4_950);
  });

  it('a bill already logged for this cycle moves to next month', () => {
    // Logged 20 Oct: the next one is 20 Nov, day 26.
    const p = projectBalance([bank], [netflixSep, netflixOct], now)!;
    expect(p.points[25].balance).toBe(5_000);
    expect(p.points[26].balance).toBe(4_950);
  });

  it('adds recurring income once', () => {
    const salary = ['2026-08-27', '2026-09-27', '2026-10-27'].map(date =>
      tx({ type: 'income', merchant: 'Salary', category: 'Salary', amount: 10_000, date }));
    // Logged 27 Aug and 27 Sep: one salary on 27 Oct, not one per row.
    expect(projectBalance([bank], salary.slice(0, 2), now)!.endBalance).toBe(15_000);
    // With 27 Oct logged ahead, the next is 27 Nov, past the 30 days.
    expect(projectBalance([bank], salary, now)!.endBalance).toBe(5_000);
  });

  it('counts recurring income that was saved with instalment fields by the old Recurring switch', () => {
    const salary = tx({ type: 'income', merchant: 'Salary', category: 'Salary', amount: 10_000, date: '2026-09-27', totalInstallments: 12, currentInstallment: 1 });
    expect(projectBalance([bank], [salary], now)!.endBalance).toBe(15_000);
  });

  it('leaves out bills on a credit card, instalment plans and stopped bills', () => {
    const onCard = tx({ merchant: 'Spotify', amount: 20, accountId: 'Card', date: '2026-09-28' });
    const p = projectBalance([bank, card], [onCard, { ...tabby, date: '2026-09-28' }, { ...carLoan, date: '2026-09-28' }, oldGym], now)!;
    expect(p.change).toBe(0);
  });

  it('a bill due today and not logged yet still comes off', () => {
    const due = tx({ merchant: 'du', amount: 299, date: '2026-09-25' });
    const p = projectBalance([bank], [due], now)!;
    expect(p.points[0].balance).toBe(5_000);
    expect(p.points[1].balance).toBe(4_701);
  });

  it('has nothing to project without a cash or debit account', () => {
    expect(projectBalance([card], [netflixOct], now)).toBeNull();
  });
});

describe('"Left until payday" bills', () => {
  it('one per running bill, cash and debit only, the same bills as Upcoming Bills', () => {
    // Review: the gym cancelled in June still came off "Left until payday"
    // while Upcoming Bills, the tracker and the banner had dropped it.
    const onCard = tx({ merchant: 'Spotify', amount: 20, accountId: 'Card', date: '2026-10-10' });
    const bills = nextRecurringBills([bank, card], [...all, onCard], now);
    expect(bills.map(b => b.name)).toEqual(['Gym', 'Netflix']);
    expect(upcomingBills([bank, card], all, now).map(b => b.name).sort()).toEqual(['Gym', 'Netflix']);
  });

  it('a bill not logged for 3 months is not subtracted', () => {
    const stopped = tx({ merchant: 'Gym', amount: 300, date: '2026-07-20' });
    expect(nextRecurringBills([bank], [stopped], new Date(2026, 10, 14))).toEqual([]);
  });
});

describe('two bills from one provider in one category', () => {
  // Both bills logged in September and in October: a pattern, so two bills.
  const mobileSep = tx({ merchant: 'Etisalat', amount: 150, category: 'Utilities', date: '2026-09-05' });
  const internetSep = tx({ merchant: 'Etisalat', amount: 389, category: 'Utilities', date: '2026-09-10' });
  const mobile = tx({ merchant: 'Etisalat', amount: 150, category: 'Utilities', date: '2026-10-05' });
  const internet = tx({ merchant: 'Etisalat', amount: 389, category: 'Utilities', date: '2026-10-10' });
  const both = [mobileSep, internetSep, mobile, internet];

  it('are two bills, not the latest one', () => {
    // Review: activeRecurring kept only 389, and the 150 bill vanished everywhere.
    const bills = activeRecurring(both, now);
    expect(bills.map(b => b.amount).sort((a, b) => a - b)).toEqual([150, 389]);
    expect(monthlyRecurringTotal(bills)).toBe(539);
    expect(upcomingBills([bank], both, now)).toHaveLength(2);
    expect(nextRecurringBills([bank], both, now)).toHaveLength(2);
  });

  it('stay two when only one of them is logged in the new month', () => {
    const mobileNov = { ...mobile, id: 'm-nov', amount: 155, date: '2026-11-05' };
    const nov = new Date(2026, 10, 6);
    const bills = activeRecurring([...both, mobileNov], nov);
    expect(bills.map(b => b.amount).sort((a, b) => a - b)).toEqual([155, 389]);
    expect(notLoggedThisMonth([...both, mobileNov], nov).map(b => b.amount)).toEqual([389]);
  });

  it('a variable bill paid early is one bill, not two (final review)', () => {
    // DEWA 400 in September, 410 on 2 Oct, then November's 300 paid on 30 Oct.
    const rows = [
      tx({ merchant: 'DEWA', amount: 400, category: 'Utilities', date: '2026-09-02' }),
      tx({ merchant: 'DEWA', amount: 410, category: 'Utilities', date: '2026-10-02' }),
      tx({ merchant: 'DEWA', amount: 300, category: 'Utilities', date: '2026-10-30' }),
    ];
    const nov = new Date(2026, 10, 14);
    const bills = activeRecurring(rows, nov);
    expect(bills.map(b => b.amount)).toEqual([300]);
    expect(monthlyRecurringTotal(bills)).toBe(300);
    expect(upcomingBills([bank], rows, nov)).toHaveLength(1);
    expect(nextRecurringBills([bank], rows, nov)).toHaveLength(1);
  });

  it('rent paid in two parts in one month is one bill', () => {
    const rows = [
      tx({ merchant: 'Landlord', amount: 3000, category: 'Rent', date: '2026-09-01' }),
      tx({ merchant: 'Landlord', amount: 2000, category: 'Rent', date: '2026-10-01' }),
      tx({ merchant: 'Landlord', amount: 1000, category: 'Rent', date: '2026-10-15' }),
    ];
    expect(activeRecurring(rows, now)).toHaveLength(1);
  });

  it('a price change from one month to the next is still one bill', () => {
    const next = { ...mobile, id: 'm2', amount: 389, date: '2026-11-05' };
    expect(activeRecurring([mobile, next], new Date(2026, 10, 6))).toHaveLength(1);
  });
});
