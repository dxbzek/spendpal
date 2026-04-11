import { parseISO, subDays, format } from 'date-fns';
import type { Transaction } from '@/types/finance';

/**
 * Detects potential duplicate transactions in O(n) time using date-bucket hashing.
 *
 * Two transactions are considered duplicates if they share the same type, amount,
 * and merchant name (case-insensitive) and fall within a 24-hour window.
 *
 * Strategy: bucket by day. For cross-midnight cases, each transaction is indexed
 * under its own date AND the previous day's date, so a transaction at 23:55 and
 * one at 00:05 the next day will both land in the same bucket.
 */
export function detectDuplicates(transactions: Transaction[]): Set<string> {
  // Map<bucketKey, transactionId[]>
  const buckets = new Map<string, string[]>();

  const addToBucket = (key: string, id: string) => {
    const existing = buckets.get(key);
    if (existing) {
      existing.push(id);
    } else {
      buckets.set(key, [id]);
    }
  };

  for (const tx of transactions) {
    const day = tx.date.slice(0, 10); // 'YYYY-MM-DD'
    const merchant = tx.merchant.toLowerCase();
    const key = `${tx.type}|${tx.amount}|${merchant}|${day}`;
    addToBucket(key, tx.id);

    // Also index under the previous day to catch cross-midnight duplicates
    const prev = getPreviousDay(day);
    const prevKey = `${tx.type}|${tx.amount}|${merchant}|${prev}`;
    addToBucket(prevKey, tx.id);
  }

  const dupes = new Set<string>();
  for (const ids of buckets.values()) {
    // Deduplicate IDs within a bucket (a tx may appear twice due to prev-day indexing)
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length > 1) {
      uniqueIds.forEach(id => dupes.add(id));
    }
  }

  return dupes;
}

function getPreviousDay(dateStr: string): string {
  return format(subDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
}
