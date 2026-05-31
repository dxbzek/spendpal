// Pure debt-payoff math. Single source of truth shared by the Debt page and
// its tests — no React, no imports.

export const DEFAULT_APR = 20; // %

export interface StrategyDebt {
  id: string;
  owed: number;
  apr: number;
  minPay: number;
}

export interface StrategyResult {
  totalInterest: number;
  months: number;
  hitCap: boolean;
}

/** Months to pay off `principal` at `apr`% with a fixed `monthlyPayment`. */
export function monthsToPayoff(principal: number, apr: number, monthlyPayment: number): number {
  if (monthlyPayment <= 0 || principal <= 0) return Infinity;
  const r = apr / 100 / 12;
  if (r === 0) return Math.ceil(principal / monthlyPayment);
  if (monthlyPayment <= principal * r) return Infinity;
  return Math.ceil(-Math.log(1 - (principal * r) / monthlyPayment) / Math.log(1 + r));
}

/** Total interest paid over the life of the debt (Infinity if it never amortizes). */
export function totalInterest(principal: number, apr: number, monthlyPayment: number): number {
  const months = monthsToPayoff(principal, apr, monthlyPayment);
  if (months === Infinity) return Infinity;
  return monthlyPayment * months - principal;
}

/** Typical credit-card minimum payment: greater of a floor and 2% of balance. */
export function minPayment(principal: number): number {
  return Math.max(25, principal * 0.02);
}

/**
 * Simulate multi-card payoff with a fixed extra payment allocated per the given
 * `order` (avalanche = highest APR first, snowball = smallest balance first).
 * Returns Infinity months/interest if the budget can't cover interest.
 */
export function simulateStrategy(
  debts: StrategyDebt[],
  order: StrategyDebt[],
  extraBudget: number,
): StrategyResult {
  // Start with min payments for all, put extra towards priority card
  const states = debts.map((d) => ({ ...d, balance: d.owed }));
  const minBudget = debts.reduce((s, d) => s + d.minPay, 0);
  const totalBudget = minBudget + extraBudget;

  let month = 0;
  let prevTotalBalance = debts.reduce((s, d) => s + d.owed, 0);

  while (states.some((s) => s.balance > 0) && month < 600) {
    month++;
    // Apply interest first
    states.forEach((s) => {
      if (s.balance > 0) {
        s.balance += s.balance * (s.apr / 100 / 12);
      }
    });

    // Determine priority card (first in order that still has balance)
    const priorityId = order.find((o) => states.find((s) => s.id === o.id)!.balance > 0)?.id;
    let remaining = totalBudget;

    // Pay min on non-priority, full allocation on priority
    for (const state of states) {
      if (state.balance <= 0) continue;
      if (state.id === priorityId) continue;
      const pay = Math.min(state.minPay, state.balance);
      state.balance = Math.max(0, state.balance - pay);
      remaining -= pay;
    }

    // Put rest on priority
    const priorityState = states.find((s) => s.id === priorityId);
    if (priorityState && priorityState.balance > 0) {
      const pay = Math.min(remaining, priorityState.balance);
      priorityState.balance = Math.max(0, priorityState.balance - pay);
    }

    // Non-convergence guard: if total balance is not decreasing, payments can't cover interest
    const newTotalBalance = states.reduce((s, st) => s + Math.max(0, st.balance), 0);
    if (month > 1 && newTotalBalance >= prevTotalBalance) {
      return { totalInterest: Infinity, months: Infinity, hitCap: true };
    }
    prevTotalBalance = newTotalBalance;
  }

  const hitCap = month >= 600;
  // Compute total interest: (total paid) - (original principal)
  const totalPaid = totalBudget * month - states.reduce((s, st) => s + Math.max(0, st.balance), 0);
  const originalPrincipal = debts.reduce((s, d) => s + d.owed, 0);
  return { totalInterest: Math.max(0, totalPaid - originalPrincipal), months: month, hitCap };
}
