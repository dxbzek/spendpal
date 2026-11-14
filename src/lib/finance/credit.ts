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

export interface CreditTotals {
  /** Sum of the limits of every card that has one, whether or not it carries a balance. */
  limit: number;
  /** What is owed on those same cards. */
  used: number;
  /** used / limit as a percentage clamped to 0–100, or null when no card has a limit. */
  utilization: number | null;
}

/**
 * Total credit limit, amount used and overall utilization. Home and the Debt
 * page both read this, so they cannot disagree: Debt used to drop every card
 * with nothing owed before adding up the limits, which showed a lower limit
 * and a higher utilization than Home for the same accounts.
 *
 * Only cards with a limit above zero count on either side. An account with no
 * limit (Tabby and the like, or money owed to a person) has nothing to measure
 * against, and its balance would inflate "used" against limits it never added
 * to. A card in credit (negative balance) counts as 0 used: it does not pay
 * down another card.
 */
export function creditTotals(accounts: CreditFields[]): CreditTotals {
  let limit = 0;
  let used = 0;
  for (const a of accounts) {
    if (a.type !== 'credit' || !((a.creditLimit ?? 0) > 0)) continue;
    limit += a.creditLimit ?? 0;
    used += Math.max(0, a.balance);
  }
  return {
    limit,
    used,
    utilization: limit > 0 ? Math.max(0, Math.min((used / limit) * 100, 100)) : null,
  };
}
