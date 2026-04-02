import { PageSpinner } from '@/components/ui/spinner';
import { useMemo, useState } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { format, parseISO } from 'date-fns';
import { CreditCard, CheckCircle2, ChevronLeft, X } from 'lucide-react';

interface InstallmentPlan {
  key: string;
  merchant: string;
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
  note: string | null;
}

/** Round to 2 decimal places to avoid floating-point display artefacts. */
const round2 = (n: number) => Math.round(n * 100) / 100;

const Installments = () => {
  const { transactions, loading } = useFinance();
  const { fmt } = useCurrency();
  const [selectedPlan, setSelectedPlan] = useState<InstallmentPlan | null>(null);

  const plans = useMemo<InstallmentPlan[]>(() => {
    const installmentTxs = transactions.filter(
      tx => tx.totalInstallments != null && tx.currentInstallment != null
    );

    const map: Record<string, typeof installmentTxs> = {};
    installmentTxs.forEach(tx => {
      const key = `${tx.merchant}|${tx.totalInstallments}`;
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });

    return Object.entries(map).map(([key, txs]) => {
      const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      const totalInstallments = latest.totalInstallments!;
      // Use currentInstallment when explicitly set (user-tracked workflow);
      // fall back to txs.length when payments are each logged as separate entries.
      const paidInstallments = latest.currentInstallment != null
        ? latest.currentInstallment
        : txs.length;
      const amountPerInstallment = latest.amount;
      // Prefer the explicit loan total; fall back to installment × count.
      const loanTotalAmount = latest.loanTotalAmount ?? null;
      const totalAmount = loanTotalAmount ?? round2(amountPerInstallment * totalInstallments);
      const paidAmount = round2(paidInstallments * amountPerInstallment);

      return {
        key,
        merchant: latest.merchant,
        category: latest.category,
        categoryIcon: latest.categoryIcon,
        totalInstallments,
        paidInstallments,
        amountPerInstallment,
        totalAmount,
        paidAmount,
        latestDate: latest.date,
        isTrackingOnly: txs.some(t => t.isTrackingOnly),
        loanTotalAmount,
        note: latest.note ?? null,
      };
    }).sort((a, b) => {
      // Active plans first, then completed
      const aDone = a.paidInstallments >= a.totalInstallments;
      const bDone = b.paidInstallments >= b.totalInstallments;
      if (aDone !== bDone) return aDone ? 1 : -1;
      return b.latestDate.localeCompare(a.latestDate);
    });
  }, [transactions]);

  const activePlans = plans.filter(p => p.paidInstallments < p.totalInstallments);
  const completedPlans = plans.filter(p => p.paidInstallments >= p.totalInstallments);
  const totalRemaining = activePlans.reduce((s, p) => {
    const rem = p.totalInstallments - p.paidInstallments;
    return s + round2(rem * p.amountPerInstallment);
  }, 0);

  if (loading) return <PageSpinner />;

  // ── Detail sheet ──────────────────────────────────────────────────────────
  if (selectedPlan) {
    const plan = selectedPlan;
    const remainingInstallments = Math.max(0, plan.totalInstallments - plan.paidInstallments);
    const remainingPayments = round2(remainingInstallments * plan.amountPerInstallment);
    const paidPayments = round2(plan.paidInstallments * plan.amountPerInstallment);
    const grossTotal = round2(plan.totalInstallments * plan.amountPerInstallment);

    // Principal-based breakdown only available when loanTotalAmount is set
    const hasLoan = plan.loanTotalAmount != null && plan.loanTotalAmount > 0;
    const loanTotal = plan.loanTotalAmount ?? grossTotal;
    const principalPerInstallment = round2(loanTotal / plan.totalInstallments);
    const interestPerInstallment = round2(plan.amountPerInstallment - principalPerInstallment);

    const paidPrincipal = round2(plan.paidInstallments * principalPerInstallment);
    const remainingPrincipal = round2(loanTotal - paidPrincipal);
    const remainingInterest = round2(remainingInstallments * interestPerInstallment);

    const progressPct = plan.totalInstallments > 0
      ? Math.round((plan.paidInstallments / plan.totalInstallments) * 100)
      : 0;

    return (
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        {/* Back header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedPlan(null)}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
            aria-label="Back"
          >
            <ChevronLeft size={18} />
          </button>
          <h1 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Installment Plan
          </h1>
        </div>

        {/* Progress card */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paid Till Now</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-heading font-bold">{fmt(paidPrincipal)}</span>
            <span className="text-sm text-muted-foreground">of {fmt(loanTotal)}</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">
            Remaining &nbsp;<span className="font-medium text-foreground">{fmt(remainingPrincipal)}</span>
          </p>
        </div>

        {/* Details */}
        <div className="bg-card rounded-2xl border border-border divide-y divide-border mb-4">
          <DetailRow label="Monthly installment amount" value={fmt(plan.amountPerInstallment)} />
          <DetailRow label="Repayment period" value={`${plan.totalInstallments} month${plan.totalInstallments !== 1 ? 's' : ''}`} />
          <DetailRow label="Remaining payments" value={fmt(remainingPayments)} />
          <DetailRow label="Paid payments (gross)" value={fmt(paidPayments)} />
          <DetailRow label="Remaining Principal Amount" value={fmt(remainingPrincipal)} />
          <DetailRow label="Remaining installments" value={String(remainingInstallments)} />
          {hasLoan && interestPerInstallment > 0 && (
            <DetailRow label="Remaining Interest Amount" value={fmt(remainingInterest)} />
          )}
          {plan.note && (
            <DetailRow label="Description" value={plan.note} />
          )}
        </div>

        {/* Progress text */}
        <p className="text-center text-sm text-muted-foreground mb-6">
          {plan.paidInstallments} of {plan.totalInstallments} installments paid · {progressPct}% complete
        </p>

        {/* Cancel placeholder — actual cancel logic lives in the transaction edit flow */}
        <button
          onClick={() => setSelectedPlan(null)}
          className="w-full py-3.5 rounded-2xl bg-destructive/10 text-destructive font-semibold text-sm"
        >
          Close
        </button>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold">Installments</h1>
        <p className="text-sm text-muted-foreground">Track your payment plans</p>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No installment plans yet</p>
          <p className="text-sm">Add transactions with installment info to track them here</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          {activePlans.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card rounded-2xl border border-border p-4 text-center">
                <p className="text-2xl font-bold text-primary">{activePlans.length}</p>
                <p className="text-xs text-muted-foreground">Active plans</p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-4 text-center">
                <p className="text-lg font-bold text-expense">{fmt(totalRemaining)}</p>
                <p className="text-xs text-muted-foreground">Total remaining</p>
              </div>
            </div>
          )}

          {/* Active Plans */}
          {activePlans.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active</h2>
              {activePlans.map(plan => {
                const progress = Math.round((plan.paidInstallments / plan.totalInstallments) * 100);
                const remainingCount = plan.totalInstallments - plan.paidInstallments;
                const remainingAmt = round2(remainingCount * plan.amountPerInstallment);
                return (
                  <button
                    key={plan.key}
                    onClick={() => setSelectedPlan(plan)}
                    className="w-full text-left bg-card rounded-2xl border border-border p-4 space-y-3 active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">{plan.categoryIcon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{plan.merchant}</p>
                          {plan.isTrackingOnly && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">Tracking</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{plan.category}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">{fmt(plan.amountPerInstallment)}/mo</p>
                        <p className="text-xs text-muted-foreground">{plan.paidInstallments}/{plan.totalInstallments} paid</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{progress}% complete</span>
                        <span>{fmt(plan.paidAmount)} / {fmt(plan.totalAmount)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                      <span>Last payment: {format(parseISO(plan.latestDate), 'MMM d, yyyy')}</span>
                      <span className="font-medium text-expense">{fmt(remainingAmt)} left ({remainingCount} payment{remainingCount !== 1 ? 's' : ''})</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Completed Plans */}
          {completedPlans.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed</h2>
              {completedPlans.map(plan => (
                <div key={plan.key} className="bg-card rounded-2xl border border-border p-4 opacity-60">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl shrink-0">{plan.categoryIcon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{plan.merchant}</p>
                        {plan.isTrackingOnly && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">Tracking</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{plan.totalInstallments} payments · {fmt(plan.totalAmount)} total</p>
                    </div>
                    <CheckCircle2 size={16} className="text-income shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between px-4 py-3.5">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value}</p>
  </div>
);

export default Installments;
