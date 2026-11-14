// The next few bills for Home's "Upcoming Bills". Pure, so it's unit-tested.
//
// Cards: what the latest statement asks for, due on the statement's date —
// the same figure Card payments shows, never the card's whole balance. A card
// without an upcoming statement isn't listed; Card payments asks for it.
// Recurring expenses: each running bill once, at its next occurrence within
// 30 days. Instalment rows are left out: card instalments are already in that
// card's statement total, and the Installments page owns the rest.
import { differenceInDays } from 'date-fns';
import type { Account, Transaction } from '@/types/finance';
import { cardStatuses } from '@/lib/finance/cardPayments';
import { activeRecurring, nextDueDate } from '@/lib/finance/recurringBills';

export interface UpcomingBill {
  name: string;
  icon: string;
  amount: number;
  dueDate: Date;
  daysLeft: number;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function upcomingBills(accounts: Account[], transactions: Transaction[], now: Date, limit = 5): UpcomingBill[] {
  const today = startOfDay(now);
  const bills: UpcomingBill[] = [];

  for (const s of cardStatuses(accounts, now)) {
    if (s.kind !== 'due' || s.total <= 0) continue;
    bills.push({
      name: s.account.name,
      icon: s.account.icon,
      amount: s.total,
      dueDate: s.dueOn,
      daysLeft: differenceInDays(s.dueOn, today),
    });
  }

  // One entry per bill, from its latest row. Every logged row used to be
  // listed, so a bill logged in September and October showed twice.
  for (const t of activeRecurring(transactions, now)) {
    const nextDate = nextDueDate(t.date, now);
    if (!nextDate) continue;
    const daysLeft = differenceInDays(nextDate, today);
    if (daysLeft <= 30) {
      bills.push({ name: t.merchant || t.category, icon: t.categoryIcon, amount: t.amount, dueDate: nextDate, daysLeft });
    }
  }

  return bills.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, limit);
}
