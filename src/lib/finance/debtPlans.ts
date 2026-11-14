// Which instalment plans sit inside a card's balance, and how that balance
// splits into plan principal and revolving debt. Pure, so the Debt page's
// figures are unit-tested.
import type { Transaction } from '@/types/finance';
import { splitOwed, type OwedSplit } from '@/lib/finance/debtPayoff';
import { buildPlans, planLeft, remainingInstallments, type InstallmentPlan } from '@/lib/finance/installments';
import { roundMoney } from '@/lib/finance/money';

/**
 * Open instalment plans by the account they are billed to.
 *
 * Only "tracking only" plans count. For those the purchase is already on the
 * card, so the plan's principal is inside the card's balance and the rows
 * only track progress. A plan whose rows post each instalment adds to the
 * balance as it is logged: what is left on it is not in the balance yet, and
 * taking it out would understate the card debt.
 */
export function openPlansByAccount(transactions: Transaction[]): Record<string, InstallmentPlan[]> {
  const byAccount: Record<string, InstallmentPlan[]> = {};
  for (const plan of buildPlans(transactions)) {
    if (!plan.isTrackingOnly || remainingInstallments(plan) === 0) continue;
    (byAccount[plan.accountId] ??= []).push(plan);
  }
  return byAccount;
}

/**
 * Principal still owed on a plan: the part of it that sits in the card's
 * balance. The same figure as "Remaining principal" on the Installments page:
 * the statement's number when entered; else a straight-line share of the
 * item price when that was entered; else instalment x instalments left.
 *
 * The last case includes any interest the plan charges, because nothing on
 * the plan says how much of each instalment is interest. For a 0% plan it is
 * exact.
 */
export function planPrincipalLeft(plan: InstallmentPlan): number {
  if (plan.remainingPrincipal != null) return plan.remainingPrincipal;
  const price = plan.loanTotalAmount;
  if (price != null && price > 0 && plan.totalInstallments > 0) {
    const principalPerInstallment = roundMoney(price / plan.totalInstallments);
    return Math.max(0, roundMoney(price - roundMoney(plan.paidInstallments * principalPerInstallment)));
  }
  return planLeft(plan);
}

/** A card's owed amount split into the principal of `plans` and the revolving rest. */
export const splitOwedByPlans = (owed: number, plans: InstallmentPlan[]): OwedSplit =>
  splitOwed(owed, plans.map(p => ({ left: planPrincipalLeft(p), perMonth: p.amountPerInstallment })));
