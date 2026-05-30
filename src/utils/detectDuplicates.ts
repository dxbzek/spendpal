import type { Transaction } from '@/types/finance';

// Window size: index each transaction under its own date plus N prior days.
// 3 days catches re-imports where the same statement is uploaded on different days,
// while being narrow enough to avoid flagging monthly recurring charges as duplicates.
const DUPLICATE_WINDOW_DAYS = 3;

// If the same (merchant + amount) appears at least this many times in a single
// calendar month, treat any in-window hits as a recurring pattern (daily metro
// top-ups, daily coffee, repeated small gov fees) rather than a duplicate. This
// keeps the warning meaningful for the rare-charge case (statement re-imports)
// without crying wolf for daily commuters.
const RECURRING_MONTHLY_THRESHOLD = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Detects potential duplicate transactions in O(n) time using date-bucket hashing.
 *
 * Two transactions are considered duplicates if they share the same type, amount,
 * and merchant name (case-insensitive) and fall within a 3-day window — UNLESS the
 * (merchant + amount) combination recurs frequently within the same month, in which
 * case it is a recurring pattern and is left unflagged.
 */
export function detectDuplicates(transactions: Transaction[]): Set<string> {
  // Map<bucketKey, transactionId[]>
  const buckets = new Map<string, string[]>();
  // `merchant|amount|YYYY-MM` -> count, to recognise recurring patterns.
  const monthlyFreq = new Map<string, number>();
  // id -> its `merchant|amount|YYYY-MM` key.
  const monthKeyById = new Map<string, string>();

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

    const monthKey = `${merchant}|${tx.amount}|${tx.date.slice(0, 7)}`;
    monthlyFreq.set(monthKey, (monthlyFreq.get(monthKey) ?? 0) + 1);
    monthKeyById.set(tx.id, monthKey);

    // Index under own date
    addToBucket(`${tx.type}|${tx.amount}|${merchant}|${day}`, tx.id);
    // Also index under prior days to catch re-imports and cross-midnight duplicates.
    // Native UTC date math (no date-fns) keeps this hot loop fast.
    const baseMs = Date.parse(`${day}T00:00:00Z`);
    for (let offset = 1; offset <= DUPLICATE_WINDOW_DAYS; offset++) {
      const prior = new Date(baseMs - offset * MS_PER_DAY).toISOString().slice(0, 10);
      addToBucket(`${tx.type}|${tx.amount}|${merchant}|${prior}`, tx.id);
    }
  }

  const dupes = new Set<string>();
  for (const ids of buckets.values()) {
    // Deduplicate IDs within a bucket (a tx may appear in multiple buckets)
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length > 1) {
      for (const id of uniqueIds) {
        const monthKey = monthKeyById.get(id);
        // Skip frequently-recurring merchant+amount combos: not duplicates.
        if (monthKey && (monthlyFreq.get(monthKey) ?? 0) >= RECURRING_MONTHLY_THRESHOLD) continue;
        dupes.add(id);
      }
    }
  }

  return dupes;
}
