// Charges worth a second look on Home: bank/BNPL fees and recurring bills
// that cost more than last time. Pure, so it's unit-tested.
import { parseISO, subDays } from 'date-fns';
import type { Transaction } from '@/types/finance';
import { recurringKey } from '@/lib/finance/recurringBills';

const FEE_CATEGORIES = new Set(['fees', 'bank fees', 'fee', 'charges']);
// Merchant names banks and BNPLs use for a fee or interest line.
const FEE_WORDS = /\b(fees?|finance charges?|interest|late payment|penalty|over ?limit|annual charge)\b/i;

export const isFee = (t: Pick<Transaction, 'type' | 'category' | 'merchant'>) =>
  t.type === 'expense' && (FEE_CATEGORIES.has(t.category.trim().toLowerCase()) || FEE_WORDS.test(t.merchant));

export interface FeeSummary {
  fees: Transaction[]; // newest first
  total: number;
}

/** Fees logged in the last `days` days (default 30). */
export function recentFees(transactions: Transaction[], now: Date, days = 30): FeeSummary {
  const since = subDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), days);
  const fees = transactions
    .filter(t => isFee(t) && !t.isTrackingOnly && parseISO(t.date.slice(0, 10)) >= since)
    .sort((a, b) => b.date.localeCompare(a.date));
  const cents = fees.reduce((s, t) => s + Math.round(t.amount * 100), 0);
  return { fees, total: cents / 100 };
}

export interface PriceRise {
  key: string;
  name: string;
  icon: string;
  before: number;
  now: number;
  date: string; // the dearer charge
}

// Under 5%, or under 1 of the currency, is noise (FX rounding, VAT pennies).
const MIN_RISE_PCT = 5;
const MIN_RISE_ABS = 1;

/**
 * Recurring expenses whose latest charge is higher than the one before it.
 * Only the latest pair counts: once it's paid at the new price twice, it
 * stops being flagged.
 */
export function priceRises(transactions: Transaction[]): PriceRise[] {
  const byKey = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.isRecurring || t.type !== 'expense' || t.isInternal || t.isTrackingOnly || t.totalInstallments) continue;
    const k = recurringKey(t);
    const list = byKey.get(k);
    if (list) list.push(t); else byKey.set(k, [t]);
  }
  const rises: PriceRise[] = [];
  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => b.date.localeCompare(a.date));
    const [latest, prev] = rows;
    const diff = latest.amount - prev.amount;
    if (prev.amount <= 0 || diff <= 0) continue;
    if (diff < MIN_RISE_ABS || (diff / prev.amount) * 100 < MIN_RISE_PCT) continue;
    rises.push({ key, name: latest.merchant || latest.category, icon: latest.categoryIcon, before: prev.amount, now: latest.amount, date: latest.date.slice(0, 10) });
  }
  return rises.sort((a, b) => (b.now - b.before) - (a.now - a.before));
}
