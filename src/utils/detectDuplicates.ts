import { parseISO, subDays, format } from 'date-fns';
import type { Transaction } from '@/types/finance';

// Window size: index each transaction under its own date plus N prior days.
// 3 days catches re-imports where the same statement is uploaded on different days,
// while being narrow enough to avoid flagging monthly recurring charges as duplicates.
const DUPLICATE_WINDOW_DAYS = 3;

/**
 * Detects potential duplicate transactions in O(n) time using date-bucket hashing.
 *
 * Two transactions are considered duplicates if they share the same type, amount,
 * and merchant name (case-insensitive) and fall within a 3-day window.
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
    // Index under own date
    addToBucket(`${tx.type}|${tx.amount}|${merchant}|${day}`, tx.id);
    // Also index under prior days to catch re-imports and cross-midnight duplicates
    for (let offset = 1; offset <= DUPLICATE_WINDOW_DAYS; offset++) {
      const prior = format(subDays(parseISO(day), offset), 'yyyy-MM-dd');
      addToBucket(`${tx.type}|${tx.amount}|${merchant}|${prior}`, tx.id);
    }
  }

  const dupes = new Set<string>();
  for (const ids of buckets.values()) {
    // Deduplicate IDs within a bucket (a tx may appear in multiple buckets)
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length > 1) {
      uniqueIds.forEach(id => dupes.add(id));
    }
  }

  return dupes;
}
