// The three "where is this heading" figures: savings this month, a budget's
// month-end pace, and what a goal needs. Pure, so they're unit-tested. Each
// one returns nothing rather than a number it can't stand behind.
import type { Transaction } from '@/types/finance';
import { ONE_OFF_OVER } from '@/lib/finance/spendingForecast';

// ─── Savings ──────────────────────────────────────────────────────────────────

export type Savings =
  | { kind: 'none' }
  | { kind: 'saved'; rate: number; amount: number }
  | { kind: 'overspent'; amount: number };

/**
 * A savings rate only means something when income covers spending. With a
 * small refund in and the month's spending out it was "-3050%"; say how much
 * more went out than came in instead.
 */
export function savingsSummary(income: number, expenses: number): Savings {
  if (income <= 0) return { kind: 'none' };
  const amount = income - expenses;
  if (amount < 0) return { kind: 'overspent', amount: -amount };
  return { kind: 'saved', rate: Math.round((amount / income) * 100), amount };
}

// ─── Budget pace ──────────────────────────────────────────────────────────────

/** Purchases on this many separate days make a spending pace; fewer is a few bills. */
export const MIN_PACE_DAYS = 3;

export interface BudgetPace {
  /** Month-end spend if the rest of the month goes like the start. */
  projected: number;
  /** False when there's no day-to-day pattern to project from; `projected` is then what's spent so far. */
  hasPace: boolean;
}

/**
 * Where a budget ends the month. Everyday purchases are projected forward at
 * their daily rate; recurring bills and one-offs over ONE_OFF_OVER are counted
 * once. A fixed budget (rent) lands on its amount. Never capped at the budget:
 * a category heading over must say so before it gets there.
 *
 * `rows` are this month's countable expenses in the budget's category, up to today.
 */
export function budgetPace(
  budget: { amount: number; spent: number; isFixed?: boolean },
  rows: Pick<Transaction, 'amount' | 'date' | 'isRecurring'>[],
  daysElapsed: number,
  totalDays: number,
): BudgetPace {
  if (budget.isFixed) return { projected: Math.max(budget.spent, budget.amount), hasPace: false };
  const everyday = rows.filter(t => !t.isRecurring && t.amount <= ONE_OFF_OVER);
  const days = new Set(everyday.map(t => t.date)).size;
  if (daysElapsed <= 0 || days < MIN_PACE_DAYS) return { projected: budget.spent, hasPace: false };
  const perDay = everyday.reduce((s, t) => s + t.amount, 0) / daysElapsed;
  return { projected: budget.spent + perDay * Math.max(0, totalDays - daysElapsed), hasPace: true };
}

// ─── Goal pace ────────────────────────────────────────────────────────────────

export type GoalPace =
  | { kind: 'perMonth'; amount: number; months: number }
  | { kind: 'inDays'; amount: number; days: number }
  | { kind: 'overdue' }
  | null;

/**
 * What a goal with a deadline needs from here: an amount a month, or the whole
 * remainder when under a month is left. This replaces "N months at current
 * rate", which divided each goal's remainder by all of the user's savings (as
 * if every goal got all of it) and so always read too soon.
 */
export function goalPace(remaining: number, daysLeft: number | null): GoalPace {
  if (remaining <= 0 || daysLeft === null) return null;
  if (daysLeft <= 0) return { kind: 'overdue' };
  if (daysLeft < 45) return { kind: 'inDays', amount: remaining, days: daysLeft };
  const months = Math.round(daysLeft / 30.44);
  return { kind: 'perMonth', amount: remaining / months, months };
}
