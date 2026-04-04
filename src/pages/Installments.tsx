import { PageSpinner } from '@/components/ui/spinner';
import { useMemo, useState } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { format, parseISO, addMonths, startOfMonth } from 'date-fns';
import { CreditCard, CheckCircle2, ChevronLeft, Plus, Trash2, Pencil, Minus } from 'lucide-react';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';
import type { Transaction } from '@/types/finance';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ── Types ─────────────────────────────────────────────────────────────────────

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

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Component ─────────────────────────────────────────────────────────────────

const Installments = () => {
  const { transactions, loading, updateTransaction, bulkRemoveTransactions } = useFinance();
  const { fmt } = useCurrency();

  const [selectedPlan, setSelectedPlan] = useState<InstallmentPlan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<InstallmentPlan | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  // ── Plans computation ────────────────────────────────────────────────────

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
    return Object.entries(map).map(([, txs]) => {
      const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      const totalInstallments = latest.totalInstallments!;
      const paidInstallments = latest.currentInstallment ?? txs.length;
      const amountPerInstallment = latest.amount;
      const loanTotalAmount = latest.loanTotalAmount ?? null;
      const totalAmount = loanTotalAmount ?? round2(amountPerInstallment * totalInstallments);
      const paidAmount = round2(paidInstallments * amountPerInstallment);
      return {
        key: `${latest.merchant}|${totalInstallments}`,
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
      const aDone = a.paidInstallments >= a.totalInstallments;
      const bDone = b.paidInstallments >= b.totalInstallments;
      if (aDone !== bDone) return aDone ? 1 : -1;
      return b.latestDate.localeCompare(a.latestDate);
    });
  }, [transactions]);

  const activePlans = plans.filter(p => p.paidInstallments < p.totalInstallments);
  const completedPlans = plans.filter(p => p.paidInstallments >= p.totalInstallments);
  const totalRemaining = activePlans.reduce((s, p) =>
    s + round2((p.totalInstallments - p.paidInstallments) * p.amountPerInstallment), 0);

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Get the latest transaction record for a given plan */
  const getLatestTx = (plan: InstallmentPlan): Transaction | undefined =>
    transactions
      .filter(tx => tx.merchant === plan.merchant && tx.totalInstallments === plan.totalInstallments)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

  /** Increment or decrement currentInstallment on the latest tx for a plan */
  const updateProgress = async (plan: InstallmentPlan, delta: number) => {
    const tx = getLatestTx(plan);
    if (!tx) return;
    const next = Math.max(0, Math.min(plan.totalInstallments, (tx.currentInstallment ?? 0) + delta));
    await updateTransaction({ ...tx, currentInstallment: next });
  };

  const handleDeletePlan = async () => {
    if (!planToDelete) return;
    const ids = transactions
      .filter(tx => tx.merchant === planToDelete.merchant && tx.totalInstallments === planToDelete.totalInstallments)
      .map(tx => tx.id);
    await bulkRemoveTransactions(ids);
    setPlanToDelete(null);
    setSelectedPlan(null);
  };

  const openEdit = (plan: InstallmentPlan) => {
    const tx = getLatestTx(plan);
    if (!tx) return;
    setEditTx(tx);
    setSheetOpen(true);
  };

  const openAdd = () => {
    setEditTx(null);
    setSheetOpen(true);
  };

  const handleSheetClose = (open: boolean) => {
    setSheetOpen(open);
    if (!open) {
      setEditTx(null);
      // Refresh selected plan from updated transactions after edit
      if (selectedPlan) setSelectedPlan(null);
    }
  };

  if (loading) return <PageSpinner />;

  // ── Detail view ───────────────────────────────────────────────────────────

  if (selectedPlan) {
    const plan = selectedPlan;
    const remainingInstallments = Math.max(0, plan.totalInstallments - plan.paidInstallments);
    const remainingPayments = round2(remainingInstallments * plan.amountPerInstallment);
    const paidPayments = round2(plan.paidInstallments * plan.amountPerInstallment);
    const grossTotal = round2(plan.totalInstallments * plan.amountPerInstallment);
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
    const isDone = plan.paidInstallments >= plan.totalInstallments;

    // Estimate start from latest date and how many installments have been paid
    const startMonth = startOfMonth(parseISO(plan.latestDate));
    const estimatedStartMonth = addMonths(startMonth, -(plan.paidInstallments - 1));
    const estimatedEndMonth = addMonths(estimatedStartMonth, plan.totalInstallments - 1);

    // Use live plan data so progress stepper reflects real-time updates
    const livePlan = plans.find(p => p.key === plan.key) ?? plan;

    return (
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => openEdit(livePlan)}
              className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
              aria-label="Edit plan"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => setPlanToDelete(livePlan)}
              className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center text-destructive"
              aria-label="Delete plan"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Progress card */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {hasLoan ? 'Principal Paid' : 'Paid Till Now'}
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-heading font-bold">{fmt(hasLoan ? paidPrincipal : paidPayments)}</span>
            <span className="text-sm text-muted-foreground">of {fmt(hasLoan ? loanTotal : grossTotal)}</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-right">
            Remaining &nbsp;<span className="font-medium text-foreground">{fmt(hasLoan ? remainingPrincipal : remainingPayments)}</span>
          </p>
        </div>

        {/* CC / quick progress stepper */}
        {!isDone && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 mb-4">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">
              Update paid installments
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Mark installments as paid when your CC statement arrives
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => updateProgress(livePlan, -1)}
                  disabled={livePlan.paidInstallments <= 0}
                  className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center disabled:opacity-40"
                >
                  <Minus size={14} />
                </button>
                <span className="text-base font-heading font-bold min-w-[72px] text-center">
                  {livePlan.paidInstallments} / {livePlan.totalInstallments}
                </span>
                <button
                  onClick={() => updateProgress(livePlan, +1)}
                  disabled={livePlan.paidInstallments >= livePlan.totalInstallments}
                  className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Detail rows */}
        <div className="bg-card rounded-2xl border border-border divide-y divide-border mb-4">
          <DetailRow label="Monthly installment" value={fmt(plan.amountPerInstallment)} />
          <DetailRow label="Repayment period" value={`${plan.totalInstallments} month${plan.totalInstallments !== 1 ? 's' : ''}`} />
          <DetailRow label="Started" value={format(estimatedStartMonth, 'MMM yyyy')} />
          {!isDone && <DetailRow label="Projected end" value={format(estimatedEndMonth, 'MMM yyyy')} />}
          <DetailRow label="Remaining installments" value={String(remainingInstallments)} />
          <DetailRow label="Remaining payments" value={fmt(remainingPayments)} />
          {hasLoan && (
            <DetailRow label="Remaining principal" value={fmt(remainingPrincipal)} />
          )}
          {hasLoan && interestPerInstallment > 0 && (
            <DetailRow label="Remaining interest" value={fmt(remainingInterest)} />
          )}
          <DetailRow label="Paid so far" value={fmt(paidPayments)} />
          {plan.note && <DetailRow label="Description" value={plan.note} />}
        </div>

        <p className="text-center text-sm text-muted-foreground mb-6">
          {livePlan.paidInstallments} of {livePlan.totalInstallments} installments paid · {progressPct}% complete
        </p>

        {/* Delete dialog */}
        <AlertDialog open={!!planToDelete} onOpenChange={o => { if (!o) setPlanToDelete(null); }}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Installment Plan?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all transactions linked to <strong>{planToDelete?.merchant}</strong>. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePlan}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AddTransactionSheet
          open={sheetOpen}
          onOpenChange={handleSheetClose}
          editTransaction={editTx ?? undefined}
          recurringMode={!editTx}
        />
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Installments</h1>
          <p className="text-sm text-muted-foreground">Track your payment plans</p>
        </div>
        <button
          onClick={openAdd}
          className="gradient-primary text-primary-foreground rounded-xl px-3 py-2 text-sm font-medium flex items-center gap-1.5 shadow-fab active:scale-95 transition-transform"
        >
          <Plus size={15} /> New Plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No installment plans yet</p>
          <p className="text-sm">Tap "New Plan" to start tracking a payment plan</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          {activePlans.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card rounded-2xl border border-border p-4 text-center">
                <p className="text-2xl font-bold text-primary">{activePlans.length}</p>
                <p className="text-xs text-muted-foreground">Active plans</p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-4 text-center">
                <p className="text-sm font-bold">{fmt(activePlans.reduce((s, p) => s + p.amountPerInstallment, 0))}</p>
                <p className="text-xs text-muted-foreground">Monthly</p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-4 text-center">
                <p className="text-sm font-bold text-expense">{fmt(totalRemaining)}</p>
                <p className="text-xs text-muted-foreground">Total left</p>
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
                const endMonth = addMonths(startOfMonth(parseISO(plan.latestDate)), remainingCount);
                return (
                  <div key={plan.key} className="bg-card rounded-2xl border border-border p-4 space-y-3">
                    {/* Tappable top row → detail view */}
                    <button
                      onClick={() => setSelectedPlan(plan)}
                      className="w-full text-left flex items-center gap-3 active:opacity-70"
                    >
                      <span className="text-2xl shrink-0">{plan.categoryIcon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{plan.merchant}</p>
                          {plan.isTrackingOnly && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">CC/Tabby</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{plan.category}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">{fmt(plan.amountPerInstallment)}/mo</p>
                        <p className="text-xs text-muted-foreground">{plan.paidInstallments}/{plan.totalInstallments} paid</p>
                      </div>
                    </button>

                    {/* Progress bar */}
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{progress}% complete</span>
                        <span>{fmt(plan.paidAmount)} / {fmt(plan.totalAmount)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    {/* Bottom row: last payment + quick +1 button */}
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        Ends {format(endMonth, 'MMM yyyy')} · <span className="text-expense font-medium">{fmt(remainingAmt)} left</span>
                      </span>
                      <button
                        onClick={() => updateProgress(plan, +1)}
                        className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-full transition-colors"
                        title="Mark one installment as paid"
                      >
                        <Plus size={11} /> 1 paid
                      </button>
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
                <button
                  key={plan.key}
                  onClick={() => setSelectedPlan(plan)}
                  className="w-full text-left bg-card rounded-2xl border border-border p-4 opacity-60 active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl shrink-0">{plan.categoryIcon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{plan.merchant}</p>
                      <p className="text-xs text-muted-foreground">{plan.totalInstallments} payments · {fmt(plan.totalAmount)} total</p>
                    </div>
                    <CheckCircle2 size={16} className="text-income shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <AddTransactionSheet
        open={sheetOpen}
        onOpenChange={handleSheetClose}
        editTransaction={editTx ?? undefined}
        recurringMode={!editTx}
      />
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between px-4 py-3.5">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value}</p>
  </div>
);

export default Installments;
