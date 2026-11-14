// Pure debt-payoff math. Single source of truth shared by the Debt page and
// its tests. No React; the only import is the cent rounding helper.
import { roundMoney } from '@/lib/finance/money';

export const DEFAULT_APR = 20; // %

/** One open instalment plan billed to a card. */
export interface CardPlan {
  /** What is still owed on the plan. */
  left: number;
  /** Its instalment per month. */
  perMonth: number;
}

export interface OwedSplit {
  /** The part of the card's balance that is instalment plan principal. */
  inPlans: number;
  /** The rest: ordinary card debt at the card's APR. */
  revolving: number;
  /** What the plans take per month, on their own fixed schedule. */
  planMonthly: number;
}

/**
 * Splits what a card owes into instalment plan principal and revolving debt.
 *
 * A card's balance includes the principal of every plan billed to it, but
 * that part is not paid down like the rest: each plan has a fixed instalment
 * and its own rate (often 0%). Amortising the whole balance at the card APR
 * overstated the interest and pushed the debt-free date out. Only the
 * revolving part belongs in a payoff plan.
 *
 * The plan part can never be more than what is owed: plans that add up to
 * more (a stale plan, or a balance that was never set from the statement)
 * leave a revolving amount of 0, not a negative one.
 */
export function splitOwed(owed: number, plans: CardPlan[]): OwedSplit {
  const total = Math.max(0, owed);
  const open = plans.filter(p => p.left > 0);
  const principal = open.reduce((s, p) => s + p.left, 0);
  const inPlans = roundMoney(Math.min(total, principal));
  return {
    inPlans,
    revolving: roundMoney(total - inPlans),
    planMonthly: roundMoney(open.reduce((s, p) => s + p.perMonth, 0)),
  };
}

/**
 * The statement minimum that goes to the revolving part. A statement bills
 * each plan's instalment in full inside its minimum due, so that share is
 * already spoken for. Null when no statement minimum was entered.
 */
export function revolvingMinimum(statementMin: number | null | undefined, planMonthly: number): number | null {
  if (statementMin == null) return null;
  return Math.max(0, roundMoney(statementMin - planMonthly));
}

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

/** This month's minimum: the statement's when known, else the typical 2% rule. */
function minDue(minPay: number, balance: number): number {
  return Math.min(minPay > 0 ? minPay : minPayment(balance), balance);
}

/**
 * One month's split of `budget` across cards: the minimum on every card except
 * the first one in `order` that still has a balance, and everything left on
 * that one. Returns payment per card id.
 */
export function allocateMonth(
  debts: { id: string; balance: number; minPay: number }[],
  order: { id: string }[],
  budget: number,
): Record<string, number> {
  const pay: Record<string, number> = {};
  const focusId = order.find(o => (debts.find(d => d.id === o.id)?.balance ?? 0) > 0)?.id;
  let left = budget;
  for (const d of debts) {
    if (d.balance <= 0 || d.id === focusId) continue;
    pay[d.id] = minDue(d.minPay, d.balance);
    left -= pay[d.id];
  }
  const focus = debts.find(d => d.id === focusId);
  if (focus) pay[focus.id] = Math.max(0, Math.min(left, focus.balance));
  return pay;
}

/**
 * A monthly amount that at least covers this month's interest and minimums,
 * rounded up to a tidy figure. Below it the balances never shrink.
 */
export function minimumMonthlyBudget(debts: StrategyDebt[]): number {
  const interest = debts.reduce((s, d) => s + d.owed * (d.apr / 100 / 12), 0);
  const minimums = debts.reduce((s, d) => s + minDue(d.minPay, d.owed), 0);
  return Math.ceil(Math.max(interest * 1.05, minimums) / 10) * 10;
}

/**
 * Simulate paying `monthlyBudget` a month across all cards, minimums first and
 * the rest on the first card in `order` (avalanche = highest APR first,
 * snowball = smallest balance first). Infinity months/interest if the budget
 * can't get ahead of the interest.
 */
export function simulateStrategy(
  debts: StrategyDebt[],
  order: StrategyDebt[],
  monthlyBudget: number,
): StrategyResult {
  const states = debts.map(d => ({ id: d.id, minPay: d.minPay, apr: d.apr, balance: d.owed }));
  let month = 0;
  let prevTotalBalance = debts.reduce((s, d) => s + d.owed, 0);
  // Cash actually paid, not budget * months: the last month only pays what's
  // left, and counting the unused surplus showed up as phantom interest on
  // 0%-APR (BNPL) plans.
  let totalPaid = 0;

  while (states.some(s => s.balance > 0) && month < 600) {
    month++;
    for (const s of states) if (s.balance > 0) s.balance += s.balance * (s.apr / 100 / 12);
    const pay = allocateMonth(states, order, monthlyBudget);
    for (const s of states) {
      const p = pay[s.id] ?? 0;
      s.balance = Math.max(0, s.balance - p);
      totalPaid += p;
    }
    const newTotalBalance = states.reduce((t, s) => t + s.balance, 0);
    if (newTotalBalance >= prevTotalBalance) {
      return { totalInterest: Infinity, months: Infinity, hitCap: true };
    }
    prevTotalBalance = newTotalBalance;
  }

  const hitCap = month >= 600;
  const originalPrincipal = debts.reduce((s, d) => s + d.owed, 0);
  return { totalInterest: Math.max(0, totalPaid - originalPrincipal), months: month, hitCap };
}
