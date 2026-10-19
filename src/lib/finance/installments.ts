// Instalment plans built from their transaction rows, and when each one
// really ends. Pure functions, no React, so Installments is unit-tested.
//
// A plan is the set of rows sharing merchant + total instalments; the latest
// row carries the paid count (the +/- stepper writes currentInstallment on it)
// and, when typed from a statement, the remaining principal.
//
// The row's date is when the plan was logged, not when the next instalment is
// due, so the schedule comes from the account the plan is billed to: the next
// unpaid instalment is due on that card's statement due date (or its due day),
// and one more falls due each month after that.
import type { Account, Transaction } from '@/types/finance';
import { parseDay } from '@/lib/finance/cardPayments';

export interface InstallmentPlan {
  key: string;
  merchant: string;
  accountId: string;
  category: string;
  categoryIcon: string;
  totalInstallments: number;
  paidInstallments: number;
  amountPerInstallment: number;
  totalAmount: number;
  paidAmount: number;
  latestDate: string;
  isTrackingOnly: boolean;
  loanTotalAmount: number | null;
  remainingPrincipal: number | null;
  note: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "[CC] Noon", "[Tabby] Amazon" → "Noon", "Amazon". The account says which card. */
export const planDisplayName = (merchant: string) =>
  merchant.replace(/^\s*\[[^\]]*\]\s*/, '') || merchant;

export function buildPlans(transactions: Transaction[]): InstallmentPlan[] {
  const map: Record<string, Transaction[]> = {};
  for (const tx of transactions) {
    if (tx.totalInstallments == null || tx.currentInstallment == null) continue;
    const key = `${tx.merchant}|${tx.totalInstallments}`;
    (map[key] ??= []).push(tx);
  }
  return Object.entries(map).map(([key, txs]) => {
    const latest = [...txs].sort((a, b) => b.date.localeCompare(a.date))[0];
    const totalInstallments = latest.totalInstallments!;
    const paidInstallments = latest.currentInstallment ?? 0;
    const amountPerInstallment = latest.amount;
    const loanTotalAmount = latest.loanTotalAmount ?? null;
    return {
      key,
      merchant: latest.merchant,
      accountId: latest.accountId,
      category: latest.category,
      categoryIcon: latest.categoryIcon,
      totalInstallments,
      paidInstallments,
      amountPerInstallment,
      totalAmount: loanTotalAmount ?? round2(amountPerInstallment * totalInstallments),
      paidAmount: round2(paidInstallments * amountPerInstallment),
      latestDate: latest.date,
      isTrackingOnly: txs.some(t => t.isTrackingOnly),
      loanTotalAmount,
      remainingPrincipal: latest.remainingPrincipal ?? null,
      note: latest.note ?? null,
    };
  }).sort((a, b) => {
    const aDone = a.paidInstallments >= a.totalInstallments;
    const bDone = b.paidInstallments >= b.totalInstallments;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return b.latestDate.localeCompare(a.latestDate);
  });
}

export const remainingInstallments = (p: InstallmentPlan) =>
  Math.max(0, p.totalInstallments - p.paidInstallments);

/** What's still owed: the statement's remaining principal when entered, else EMI × instalments left. */
export const planLeft = (p: InstallmentPlan) =>
  p.remainingPrincipal ?? round2(remainingInstallments(p) * p.amountPerInstallment);

export const totalLeft = (plans: InstallmentPlan[]) =>
  round2(plans.filter(p => remainingInstallments(p) > 0).reduce((s, p) => s + planLeft(p), 0));

/** Day-of-month `day` in the month `n` months after `d`, clamped to short months. */
function onDay(d: Date, n: number, day: number): Date {
  const y = d.getFullYear(), m = d.getMonth() + n;
  return new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
}

/** Next date on or after today falling on day-of-month `day`. */
function nextOnOrAfter(day: number, today: Date): Date {
  const thisMonth = onDay(today, 0, day);
  return thisMonth >= today ? thisMonth : onDay(today, 1, day);
}

/**
 * When the next unpaid instalment is due: the card's upcoming statement due
 * date, else its due day, else the plan row's own day of month.
 */
export function nextInstallmentDue(plan: InstallmentPlan, account: Account | undefined, now: Date): Date {
  const today = startOfDay(now);
  if (account?.statementDueOn) {
    const due = parseDay(account.statementDueOn);
    if (due >= today) return due;
  }
  const day = account?.dueDate ?? parseDay(plan.latestDate).getDate();
  return nextOnOrAfter(day, today);
}

/** Due dates of the first and last instalments, or null for a finished plan. */
export function planSchedule(plan: InstallmentPlan, account: Account | undefined, now: Date) {
  const left = remainingInstallments(plan);
  if (left === 0) return null;
  const nextDue = nextInstallmentDue(plan, account, now);
  // Shift by whole months on the card's due day (so a 31st stays the 31st
  // after a short month), keeping nextDue itself exactly as the statement says.
  const day = account?.dueDate ?? nextDue.getDate();
  const shift = (n: number) => (n === 0 ? nextDue : onDay(nextDue, n, day));
  return {
    nextDue,
    startedOn: shift(-plan.paidInstallments),
    endsOn: shift(left - 1),
  };
}
