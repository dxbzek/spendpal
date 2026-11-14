// Canonical "does this transaction count toward spending / income totals?"
// predicates. These encode a single rule that used to be re-inlined across
// ~15 screens and drifted (e.g. one screen forgot `!isTrackingOnly`). Import
// from here instead of hand-writing the filter so every surface agrees.
import type { Transaction } from '@/types/finance';
import { roundMoney } from '@/lib/finance/money';

/**
 * A real, user-facing expense: not an internal movement (transfer, card
 * payment, BNPL repayment) and not tracking-only (installment bookkeeping).
 * Pending expenses ARE counted — a pending charge is still committed spending.
 */
export const isCountableExpense = (
  t: Pick<Transaction, 'type' | 'isInternal' | 'isTrackingOnly'>,
): boolean => t.type === 'expense' && !t.isInternal && !t.isTrackingOnly;

/**
 * A refund: money back for a purchase, logged as an income row in the
 * built-in "Refund" category. It is not earned income on any account. It
 * undoes spending: see netSpending.
 */
export const isRefund = (
  t: Pick<Transaction, 'type' | 'isInternal' | 'category'>,
): boolean => t.type === 'income' && !t.isInternal && t.category.trim().toLowerCase() === 'refund';

/**
 * A real, user-facing income: not an internal movement, not a refund, and not
 * posted to a credit-card account (a credit on a card isn't earned income).
 * Callers pass the set of credit account ids so this stays a pure function.
 */
export const isCountableIncome = (
  t: Pick<Transaction, 'type' | 'isInternal' | 'accountId' | 'category'>,
  creditAccountIds: Set<string>,
): boolean => t.type === 'income' && !t.isInternal && !creditAccountIds.has(t.accountId) && !isRefund(t);

type SpendingFields = Pick<Transaction, 'type' | 'isInternal' | 'isTrackingOnly' | 'category' | 'amount'>;

/** Refunds received, on any account (a card refund counts the same as a bank one). */
export const refundTotal = (transactions: SpendingFields[]): number =>
  roundMoney(transactions.reduce((s, t) => (isRefund(t) ? s + t.amount : s), 0));

/** Countable expenses before refunds. */
export const grossSpending = (transactions: SpendingFields[]): number =>
  roundMoney(transactions.reduce((s, t) => (isCountableExpense(t) ? s + t.amount : s), 0));

/**
 * Spending after refunds: countable expenses minus refunds, never below 0.
 *
 * This is a total only. A refund row does not say which purchase or category
 * it undoes, so per-category totals and budgets cannot take it off; they
 * stay before refunds. Pass the rows of one period: a refund counts in the
 * period it was received.
 */
export const netSpending = (transactions: SpendingFields[]): number =>
  Math.max(0, roundMoney(grossSpending(transactions) - refundTotal(transactions)));

/**
 * Income, spending and what is left, by the one rule every screen uses:
 * spending is after refunds (netSpending) and a refund is never income. A
 * screen that adds expenses before refunds while leaving the refund out of
 * income counts the refund nowhere, and its net disagrees with Home's.
 */
export const incomeAndSpending = (
  transactions: (SpendingFields & Pick<Transaction, 'accountId'>)[],
  creditAccountIds: Set<string>,
) => {
  const income = roundMoney(transactions.reduce((s, t) => (isCountableIncome(t, creditAccountIds) ? s + t.amount : s), 0));
  const spending = netSpending(transactions);
  return { income, spending, net: roundMoney(income - spending) };
};
