// What the Add Transaction form saves from its switches and fields.
// Pure, so it is unit-tested.
import type { TransactionType } from '@/types/finance';

export interface PlanSwitches {
  isRecurring: boolean;
  hasInstallments: boolean;
}

/**
 * The Recurring switch. On: a recurring bill and nothing more. It used to
 * switch Installment Plan on as well, so a plain subscription was saved as a
 * 12-month plan with 11 payments "left". Off: not a plan either, because a
 * plan is always recurring.
 */
export const setRecurring = (state: PlanSwitches, on: boolean): PlanSwitches => ({
  isRecurring: on,
  hasInstallments: on ? state.hasInstallments : false,
});

/** A row is saved as an instalment plan only when it is an expense with both switches on. A plan is a debt. */
export const isPlanForm = (type: TransactionType, s: PlanSwitches) =>
  type === 'expense' && s.isRecurring && s.hasInstallments;

export interface PlanFormInput extends PlanSwitches {
  type: TransactionType;
  totalInstallments: string;
  currentInstallment: string;
  loanTotalAmount: string;
  isTrackingOnly: boolean;
}

export interface PlanFields {
  totalInstallments: number | undefined;
  currentInstallment: number | undefined;
  loanTotalAmount: number | undefined;
  isTrackingOnly: boolean;
}

/** The instalment fields to save. All empty unless the row is a plan. */
export function planFields(form: PlanFormInput): PlanFields {
  if (!isPlanForm(form.type, form)) {
    return { totalInstallments: undefined, currentInstallment: undefined, loanTotalAmount: undefined, isTrackingOnly: false };
  }
  const total = parseInt(form.totalInstallments, 10) || 12;
  return {
    totalInstallments: total,
    currentInstallment: paidInstallmentsFrom(form.currentInstallment, total),
    loanTotalAmount: parseFloat(form.loanTotalAmount) || undefined,
    isTrackingOnly: form.isTrackingOnly,
  };
}

/**
 * "Installments paid so far" as typed: a whole number from 0 to the total.
 * 0 is a real answer (a plan logged before its first bill). Empty saves as 0.
 */
export function paidInstallmentsFrom(input: string, total: number): number {
  const n = parseInt(input, 10);
  return Math.max(0, Math.min(total, Number.isNaN(n) ? 0 : n));
}

/**
 * What "Installments paid so far" starts at on a new plan.
 * Paid from cash or debit: this row is the first payment, so 1.
 * Tracking only (on a card or Tabby): nothing is paid until the first bill, so 0.
 */
export const defaultPaidInstallments = (isTrackingOnly: boolean) => (isTrackingOnly ? 0 : 1);

/** The account to select when the form opens: the only one there is, else none (the user picks). */
export const defaultAccountId = (accounts: Array<{ id: string }>) =>
  accounts.length === 1 ? accounts[0].id : '';
