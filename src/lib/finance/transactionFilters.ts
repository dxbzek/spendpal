// Canonical "does this transaction count toward spending / income totals?"
// predicates. These encode a single rule that used to be re-inlined across
// ~15 screens and drifted (e.g. one screen forgot `!isTrackingOnly`). Import
// from here instead of hand-writing the filter so every surface agrees.
import type { Transaction } from '@/types/finance';

/**
 * A real, user-facing expense: not an internal movement (transfer, card
 * payment, BNPL repayment) and not tracking-only (installment bookkeeping).
 * Pending expenses ARE counted — a pending charge is still committed spending.
 */
export const isCountableExpense = (
  t: Pick<Transaction, 'type' | 'isInternal' | 'isTrackingOnly'>,
): boolean => t.type === 'expense' && !t.isInternal && !t.isTrackingOnly;

/**
 * A real, user-facing income: not an internal movement, and not posted to a
 * credit-card account (a refund/credit isn't earned income). Callers pass the
 * set of credit account ids so this stays a pure function.
 */
export const isCountableIncome = (
  t: Pick<Transaction, 'type' | 'isInternal' | 'accountId'>,
  creditAccountIds: Set<string>,
): boolean => t.type === 'income' && !t.isInternal && !creditAccountIds.has(t.accountId);
