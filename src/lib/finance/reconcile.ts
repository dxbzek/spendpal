// The adjustment row that moves an account's balance to the figure the bank
// shows. Pure, so the amount and its direction are unit-tested.
import type { AccountType } from '@/types/finance';
import { moneyDifference } from '@/lib/finance/money';

export interface ReconcileAdjustment {
  type: 'income' | 'expense';
  /** Always positive, to the cent. */
  amount: number;
  /** actual minus SpendPal's figure, to the cent. Positive: SpendPal is under. */
  drift: number;
}

/**
 * What to post so `balance` becomes `actual`, or null when they already match
 * to the cent. A cash or debit balance rises on income and falls on expense.
 * A credit balance is the amount owed, so it rises on expense and falls on
 * income: the direction flips.
 */
export function reconcileAdjustment(
  accountType: AccountType,
  balance: number,
  actual: number,
): ReconcileAdjustment | null {
  if (!Number.isFinite(actual) || !Number.isFinite(balance)) return null;
  const drift = moneyDifference(actual, balance);
  if (drift === 0) return null;
  const needsIncrease = drift > 0;
  const type = accountType === 'credit'
    ? (needsIncrease ? 'expense' : 'income')
    : (needsIncrease ? 'income' : 'expense');
  return { type, amount: Math.abs(drift), drift };
}
