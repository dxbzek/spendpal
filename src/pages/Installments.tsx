import { PageSpinner } from '@/components/ui/spinner';
import { useMemo, useState } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { format, parseISO, getMonth, getYear } from 'date-fns';
import { CreditCard, CheckCircle2, ChevronLeft, Check, Plus, TrendingDown, TrendingUp, RefreshCw, Trash2 } from 'lucide-react';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';
import type { TransactionType } from '@/types/finance';
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

interface RecurringGroup {
  key: string;
  merchant: string;
  category: string;
  categoryIcon: string;
  avgAmount: number;
  lastDate: string;
  loggedThisMonth: boolean;
  type: TransactionType;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Component ─────────────────────────────────────────────────────────────────

const Installments = () => {
  const { transactions, loading, bulkRemoveTransactions } = useFinance();
  const { fmt } = useCurrency();

  const [activeTab, setActiveTab] = useState<'installments' | 'recurring'>('installments');
  const [selectedPlan, setSelectedPlan] = useState<InstallmentPlan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<InstallmentPlan | null>(null);

  // Recurring sheet state
  const [addOpen, setAddOpen] = useState(false);
  const [prefillGroup, setPrefillGroup] = useState<RecurringGroup | null>(null);

  const hidden = localStorage.getItem('balanceHidden') === 'true';
  const mask = (val: string) => hidden ? '••••••' : val;

  // ── Installment plans ────────────────────────────────────────────────────

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
      const paidInstallments = latest.currentInstallment != null
        ? latest.currentInstallment
        : txs.length;
      const amountPerInstallment = latest.amount;
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
      const aDone = a.paidInstallments >= a.totalInstallments;
      const bDone = b.paidInstallments >= b.totalInstallments;
      if (aDone !== bDone) return aDone ? 1 : -1;
      return b.latestDate.localeCompare(a.latestDate);
    });
  }, [transactions]);

  const activePlans = plans.filter(p => p.paidInstallments < p.totalInstallments);
  const completedPlans = plans.filter(p => p.paidInstallments >= p.totalInstallments);
  const totalRemaining = activePlans.reduce((s, p) => {
    return s + round2((p.totalInstallments - p.paidInstallments) * p.amountPerInstallment);
  }, 0);

  const handleDeletePlan = async () => {
    if (!planToDelete) return;
    const ids = transactions
      .filter(tx =>
        tx.totalInstallments != null &&
        tx.merchant === planToDelete.merchant &&
        tx.totalInstallments === planToDelete.totalInstallments
      )
      .map(tx => tx.id);
    await bulkRemoveTransactions(ids);
    setPlanToDelete(null);
    setSelectedPlan(null);
  };

  // ── Recurring groups ─────────────────────────────────────────────────────

  const now = new Date();
  const thisMonth = getMonth(now);
  const thisYear = getYear(now);

  const groups = useMemo<RecurringGroup[]>(() => {
    const recurring = transactions.filter(tx => tx.isRecurring && (tx.type === 'expense' || tx.type === 'income'));
    const map: Record<string, typeof recurring> = {};
    recurring.forEach(tx => {
      const key = `${tx.merchant}|${tx.category}|${tx.type}`;
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });
    return Object.entries(map).map(([key, txs]) => {
      const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      const avgAmount = txs.reduce((s, t) => s + t.amount, 0) / txs.length;
      const loggedThisMonth = txs.some(tx => {
        const d = parseISO(tx.date);
        return getMonth(d) === thisMonth && getYear(d) === thisYear;
      });
      return {
        key,
        merchant: latest.merchant,
        category: latest.category,
        categoryIcon: latest.categoryIcon,
        avgAmount,
        lastDate: latest.date,
        loggedThisMonth,
        type: latest.type as TransactionType,
      };
    }).sort((a, b) => Number(a.loggedThisMonth) - Number(b.loggedThisMonth));
  }, [transactions, thisMonth, thisYear]);

  const expenseGroups = groups.filter(g => g.type === 'expense');
  const incomeGroups = groups.filter(g => g.type === 'income');
  const dueCount = expenseGroups.filter(g => !g.loggedThisMonth).length;
  const paidCount = expenseGroups.filter(g => g.loggedThisMonth).length;
  const monthlyCommitted = expenseGroups.reduce((s, g) => s + g.avgAmount, 0);
  const dueTotal = expenseGroups.filter(g => !g.loggedThisMonth).reduce((s, g) => s + g.avgAmount, 0);
  const monthlyIncome = incomeGroups.reduce((s, g) => s + g.avgAmount, 0);

  const handleLogPayment = (group: RecurringGroup) => {
    setPrefillGroup(group);
    setAddOpen(true);
  };

  const handleAddOpen = (open: boolean) => {
    setAddOpen(open);
    if (!open) setPrefillGroup(null);
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

    return (
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
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
          <button
            onClick={() => setPlanToDelete(plan)}
            className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center text-destructive"
            aria-label="Delete plan"
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 mb-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paid Till Now</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-heading font-bold">{fmt(paidPrincipal)}</span>
            <span className="text-sm text-muted-foreground">of {fmt(loanTotal)}</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-right">
            Remaining &nbsp;<span className="font-medium text-foreground">{fmt(remainingPrincipal)}</span>
          </p>
        </div>

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
          {plan.note && <DetailRow label="Description" value={plan.note} />}
        </div>

        <p className="text-center text-sm text-muted-foreground mb-6">
          {plan.paidInstallments} of {plan.totalInstallments} installments paid · {progressPct}% complete
        </p>

        {/* Delete confirmation dialog */}
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
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Installments</h1>
          <p className="text-sm text-muted-foreground">
            {activeTab === 'recurring'
              ? dueCount > 0
                ? `${dueCount} due this month · ${paidCount} paid`
                : groups.length > 0 ? 'All caught up this month' : 'No recurring transactions'
              : 'Track your payment plans'}
          </p>
        </div>
        {activeTab === 'recurring' && (
          <button
            onClick={() => { setPrefillGroup(null); setAddOpen(true); }}
            className="gradient-primary text-primary-foreground rounded-xl px-3 py-2 text-sm font-medium flex items-center gap-1.5 shadow-fab active:scale-95 transition-transform"
          >
            <Plus size={15} /> Log Payment
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl">
        <button
          onClick={() => setActiveTab('installments')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'installments' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
          }`}
        >
          Installments
        </button>
        <button
          onClick={() => setActiveTab('recurring')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'recurring' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
          }`}
        >
          Recurring
        </button>
      </div>

      {/* ── Installments Tab ─────────────────────────────────────────────── */}
      {activeTab === 'installments' && (
        <>
          {plans.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No installment plans yet</p>
              <p className="text-sm">Add transactions with installment info to track them here</p>
            </div>
          ) : (
            <>
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
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
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
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Recurring Tab ────────────────────────────────────────────────── */}
      {activeTab === 'recurring' && (
        <>
          {groups.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{dueCount}</p>
                  <p className="text-xs text-muted-foreground">Due this month</p>
                </div>
                <div className="flex-1 rounded-xl bg-primary/10 border border-primary/20 p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{paidCount}</p>
                  <p className="text-xs text-muted-foreground">Paid this month</p>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border">
                <div className="flex items-center gap-2">
                  <TrendingDown size={14} className="text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Monthly committed</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-sm">{mask(fmt(monthlyCommitted))}</span>
                  {dueTotal > 0 && <p className="text-[11px] text-destructive font-medium">{mask(fmt(dueTotal))} still due</p>}
                </div>
              </div>
              {incomeGroups.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Monthly recurring income</span>
                  </div>
                  <span className="font-semibold text-sm text-income">{mask(fmt(monthlyIncome))}</span>
                </div>
              )}
            </div>
          )}

          {groups.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <RefreshCw size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No recurring transactions yet</p>
              <p className="text-sm">Mark transactions as recurring when adding them</p>
            </div>
          ) : (
            <div className="space-y-5">
              {expenseGroups.length > 0 && (
                <div className="space-y-3">
                  {incomeGroups.length > 0 && (
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Expenses</p>
                  )}
                  {expenseGroups.map(group => (
                    <RecurringGroupRow key={group.key} group={group} onLog={handleLogPayment} mask={mask} fmt={fmt} />
                  ))}
                </div>
              )}
              {incomeGroups.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Income</p>
                  {incomeGroups.map(group => (
                    <RecurringGroupRow key={group.key} group={group} onLog={handleLogPayment} mask={mask} fmt={fmt} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <AddTransactionSheet
        open={addOpen}
        onOpenChange={handleAddOpen}
        recurringMode={true}
        prefill={prefillGroup ? {
          type: prefillGroup.type,
          merchant: prefillGroup.merchant,
          amount: prefillGroup.avgAmount.toFixed(2),
          category: prefillGroup.category,
          categoryIcon: prefillGroup.categoryIcon,
          isRecurring: true,
        } : null}
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

const RecurringGroupRow = ({
  group,
  onLog,
  mask,
  fmt,
}: {
  group: RecurringGroup;
  onLog: (g: RecurringGroup) => void;
  mask: (v: string) => string;
  fmt: (n: number) => string;
}) => (
  <div className={`bg-card rounded-2xl border border-border p-4 flex items-center justify-between gap-3 transition-opacity ${group.loggedThisMonth ? 'opacity-55' : ''}`}>
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-2xl shrink-0">{group.categoryIcon}</span>
      <div className="min-w-0">
        <p className="font-semibold truncate">{group.merchant}</p>
        <p className="text-xs text-muted-foreground truncate">
          {group.category} · last {format(parseISO(group.lastDate), 'd MMM yyyy')}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-3 shrink-0">
      <div className="text-right">
        <p className={`font-semibold ${group.type === 'income' ? 'text-income' : ''}`}>{mask(fmt(group.avgAmount))}</p>
        <p className="text-xs text-muted-foreground">avg/mo</p>
      </div>
      {group.loggedThisMonth ? (
        <Check size={16} className="text-primary shrink-0" />
      ) : (
        <button
          onClick={() => onLog(group)}
          className="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary hover:text-primary transition-colors shrink-0"
          aria-label={group.type === 'income' ? 'Log income' : 'Log payment'}
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  </div>
);

export default Installments;
