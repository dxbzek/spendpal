// Recurring expenses paid from cash/debit, and when each next falls due.
// Pure, so "Left until payday" is unit-tested.
//
// One bill per merchant + category: the latest logged row sets the amount and
// the day of month. A bill already logged this cycle moves to next month.
// Bills on a credit card are left out: they land on that card's statement,
// which Card payments already counts. Instalment rows are left out too: the
// Installments page owns them.
import { addMonths, parseISO } from 'date-fns';
import type { Account, Transaction } from '@/types/finance';

export interface RecurringBill {
  key: string;
  name: string;
  icon: string;
  amount: number;
  dueOn: Date;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const recurringKey = (t: Pick<Transaction, 'merchant' | 'category'>) =>
  `${t.merchant.trim().toLowerCase()}|${t.category}`;

/** Latest row of each recurring cash expense, keyed by merchant + category. */
export function latestRecurring(transactions: Transaction[]): Map<string, Transaction> {
  const latest = new Map<string, Transaction>();
  for (const t of transactions) {
    if (!t.isRecurring || t.type !== 'expense' || t.isInternal || t.isTrackingOnly || t.totalInstallments) continue;
    const k = recurringKey(t);
    const prev = latest.get(k);
    if (!prev || t.date > prev.date) latest.set(k, t);
  }
  return latest;
}

/** Recurring cash/debit bills with their next due date after today (today counts). */
export function nextRecurringBills(accounts: Account[], transactions: Transaction[], now: Date): RecurringBill[] {
  const today = startOfDay(now);
  const creditIds = new Set(accounts.filter(a => a.type === 'credit').map(a => a.id));
  const bills: RecurringBill[] = [];
  for (const [key, t] of latestRecurring(transactions)) {
    if (creditIds.has(t.accountId) || t.amount <= 0) continue;
    // Step from the logged date so the day of month survives short months.
    const base = parseISO(t.date.slice(0, 10));
    let offset = 1;
    let dueOn = addMonths(base, offset);
    while (dueOn < today && offset < 24) dueOn = addMonths(base, ++offset);
    if (dueOn < today) continue; // not logged for 2 years: stale, not a bill
    bills.push({ key, name: t.merchant || t.category, icon: t.categoryIcon, amount: t.amount, dueOn });
  }
  return bills.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime());
}
