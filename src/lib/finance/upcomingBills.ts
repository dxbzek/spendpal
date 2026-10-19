// The next few bills for Home's "Upcoming Bills". Pure, so it's unit-tested.
//
// Cards: what the latest statement asks for, due on the statement's date —
// the same figure Card payments shows, never the card's whole balance. A card
// without an upcoming statement isn't listed; Card payments asks for it.
// Recurring expenses: the next occurrence within 30 days. Instalments on a
// card (tracking-only rows) are left out: they're already in that card's
// statement total.
import { addMonths, differenceInDays, parseISO } from 'date-fns';
import type { Account, Transaction } from '@/types/finance';
import { cardStatuses } from '@/lib/finance/cardPayments';

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

  for (const t of transactions) {
    if (!t.isRecurring || t.type !== 'expense' || t.isInternal || t.isTrackingOnly) continue;
    // Step from the original date (not the last computed one) so the day of
    // month survives short months (Jan 31 → Feb 28 → Mar 31).
    const origDate = parseISO(t.date);
    let offset = 1;
    let nextDate = addMonths(origDate, offset);
    while (differenceInDays(nextDate, today) < 0 && offset < 13) {
      offset++;
      nextDate = addMonths(origDate, offset);
    }
    const daysLeft = differenceInDays(nextDate, today);
    if (daysLeft >= 0 && daysLeft <= 30) {
      bills.push({ name: t.merchant, icon: t.categoryIcon, amount: t.amount, dueDate: nextDate, daysLeft });
    }
  }

  return bills.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, limit);
}
