import { useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { format, parseISO } from 'date-fns';
import { CreditCard, CheckCircle2 } from 'lucide-react';

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
}

const Installments = () => {
  const { transactions } = useFinance();
  const { fmt } = useCurrency();

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
      const paidInstallments = txs.length;
      const amountPerInstallment = txs.reduce((s, t) => s + t.amount, 0) / txs.length;
      const paidAmount = txs.reduce((s, t) => s + t.amount, 0);
      const totalAmount = amountPerInstallment * totalInstallments;

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
  const totalRemaining = activePlans.reduce((s, p) => s + (p.totalAmount - p.paidAmount), 0);

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
                const remaining = plan.totalInstallments - plan.paidInstallments;
                return (
                  <div key={plan.key} className="bg-card rounded-2xl border border-border p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-xl shrink-0">
                        {plan.categoryIcon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{plan.merchant}</p>
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
                      <span className="font-medium text-expense">{fmt(plan.totalAmount - plan.paidAmount)} left ({remaining} payment{remaining !== 1 ? 's' : ''})</span>
                    </div>
                  </div>
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
                    <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-xl shrink-0">
                      {plan.categoryIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{plan.merchant}</p>
                      <p className="text-xs text-muted-foreground">{plan.totalInstallments} payments · {fmt(plan.totalAmount)} total</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-income/15 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={16} className="text-income" />
                    </div>
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

export default Installments;
