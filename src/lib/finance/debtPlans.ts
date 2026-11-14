// Which instalment plans sit inside a card's balance, and how that balance
// splits into plan principal and revolving debt. Pure, so the Debt page's
// figures are unit-tested.
import type { Transaction } from '@/types/finance';
import { splitOwed, type OwedSplit } from '@/lib/finance/debtPayoff';
import { buildPlans, planLeft, remainingInstallments, type InstallmentPlan } from '@/lib/finance/installments';

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

/** A card's owed amount split into the principal of `plans` and the revolving rest. */
export const splitOwedByPlans = (owed: number, plans: InstallmentPlan[]): OwedSplit =>
  splitOwed(owed, plans.map(p => ({ left: planLeft(p), perMonth: p.amountPerInstallment })));
