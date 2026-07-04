// Credit-account math. For credit accounts `balance` stores the amount OWED
// (see the Account type). These helpers centralize the "available credit" and
// "utilization %" derivations that used to be re-inlined per screen with
// divergent handling of the zero-limit and over-limit edge cases.
import type { Account } from '@/types/finance';

type CreditFields = Pick<Account, 'type' | 'creditLimit' | 'balance'>;

/**
 * Available credit = limit − owed, or null when there's no limit to subtract
 * from. Not clamped: an over-limit card legitimately reports negative available.
 */
export function availableCredit(a: CreditFields): number | null {
  if (a.type !== 'credit' || a.creditLimit == null) return null;
  return a.creditLimit - a.balance;
}

/**
 * Utilization as a percentage clamped to 0–100, or null when a percentage is
 * undefined (non-credit, or a credit card with no limit set). A $0-limit card
 * with an owed balance is treated as maxed out (100%). Callers round for
 * display; the raw clamped value is returned so bar widths and color
 * thresholds stay consistent everywhere.
 */
export function creditUtilization(a: CreditFields): number | null {
  if (a.type !== 'credit' || a.creditLimit == null) return null;
  if (a.creditLimit === 0) return a.balance > 0 ? 100 : 0;
  return Math.max(0, Math.min((a.balance / a.creditLimit) * 100, 100));
}
