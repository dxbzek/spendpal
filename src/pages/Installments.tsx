import { PageSpinner } from '@/components/ui/spinner';
import { NARROW_PAGE } from '@/lib/pageLayout';
import { useMemo, useState } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { format } from 'date-fns';
import { CreditCard, CheckCircle2, ChevronLeft, ChevronDown, Plus, Trash2, Pencil, Minus } from 'lucide-react';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';
import type { Transaction } from '@/types/finance';
import {
  buildPlans, latestPlanRow, planDisplayName, planLeft, planRows, planSchedule, principalAfterProgress, totalLeft,
  type InstallmentPlan,
} from '@/lib/finance/installments';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import AppIcon, { IconTile } from '@/components/AppIcon';
import { BigAmount, HeroCard, HeroChip, IconButton, ListCard, ListRow, Meter, PageHeader, SectionLabel, Tile } from '@/components/orbix';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Component ─────────────────────────────────────────────────────────────────

const Installments = () => {
  const { transactions, accounts, loading, updateTransaction, bulkRemoveTransactions } = useFinance();
  const { fmt } = useCurrency();

  const [selectedPlan, setSelectedPlan] = useState<InstallmentPlan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<InstallmentPlan | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  // Finished plans stay tucked away unless asked for.
  const [showCompleted, setShowCompleted] = useState(false);

  // ── Plans computation ────────────────────────────────────────────────────

  const plans = useMemo(() => buildPlans(transactions), [transactions]);
  const accountOf = (plan: InstallmentPlan) => accounts.find(a => a.id === plan.accountId);
  const now = useMemo(() => new Date(), []);

  const activePlans = plans.filter(p => p.paidInstallments < p.totalInstallments);
  const completedPlans = plans.filter(p => p.paidInstallments >= p.totalInstallments);
  const totalRemaining = totalLeft(activePlans);

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Get the latest transaction record for a given plan */
  const getLatestTx = (plan: InstallmentPlan): Transaction | undefined => latestPlanRow(transactions, plan);

  /** Increment or decrement currentInstallment on the latest tx for a plan */
  // One update per plan at a time: `next` is computed from current state, so a
  // second tap before the first save lands would just repeat the same value.
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);
  const updateProgress = async (plan: InstallmentPlan, delta: number) => {
    if (updatingPlan === plan.key) return;
    const tx = getLatestTx(plan);
    if (!tx) return;
    const paid = tx.currentInstallment ?? 0;
    const next = Math.max(0, Math.min(plan.totalInstallments, paid + delta));
    setUpdatingPlan(plan.key);
    try {
      await updateTransaction({
        ...tx,
        currentInstallment: next,
        // A typed remaining principal was true at the old count; move it with the count.
        remainingPrincipal: principalAfterProgress(tx.remainingPrincipal, plan.totalInstallments, paid, next),
      });
    } finally {
      setUpdatingPlan(null);
    }
  };

  const handleDeletePlan = async () => {
    if (!planToDelete) return;
    // Only this plan's rows: another plan at the same merchant keeps its own.
    const ids = planRows(transactions, planToDelete).map(tx => tx.id);
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
    // Live plan data, so every figure follows the +/- stepper, not just the stepper.
    const plan = plans.find(p => p.key === selectedPlan.key) ?? selectedPlan;
    const remainingInstallments = Math.max(0, plan.totalInstallments - plan.paidInstallments);
    const isDone = remainingInstallments === 0;
    const remainingPayments = round2(remainingInstallments * plan.amountPerInstallment);
    const paidPayments = round2(plan.paidInstallments * plan.amountPerInstallment);
    const grossTotal = round2(plan.totalInstallments * plan.amountPerInstallment);
    const hasLoan = plan.loanTotalAmount != null && plan.loanTotalAmount > 0;
    const loanTotal = plan.loanTotalAmount ?? grossTotal;
    const principalPerInstallment = round2(loanTotal / plan.totalInstallments);
    const interestPerInstallment = round2(plan.amountPerInstallment - principalPerInstallment);
    // With a purchase price, plan.paidAmount is the principal paid (same figure as the list card).
    const paidPrincipal = hasLoan ? plan.paidAmount : paidPayments;
    // The statement's figure wins over the straight-line estimate.
    const remainingPrincipal = isDone ? 0 : plan.remainingPrincipal ?? round2(loanTotal - paidPrincipal);
    const remainingInterest = round2(remainingInstallments * interestPerInstallment);
    const progressPct = plan.totalInstallments > 0
      ? Math.round((plan.paidInstallments / plan.totalInstallments) * 100)
      : 0;

    const schedule = planSchedule(plan, accountOf(plan), now);

    const livePlan = plan;

    return (
      <div className={`${NARROW_PAGE} pb-28`}>
        {/* Header: round back button, title, round edit / delete */}
        <div className="flex items-center justify-between gap-3 pt-[calc(env(safe-area-inset-top,0px)+20px)] md:pt-8 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <IconButton onClick={() => setSelectedPlan(null)} aria-label="Back">
              <ChevronLeft size={18} />
            </IconButton>
            <div className="min-w-0">
              <h1 className="text-lg font-heading font-semibold tracking-tight truncate">Installment Plan</h1>
              <p className="text-xs text-muted-foreground truncate">{planDisplayName(plan.merchant)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <IconButton onClick={() => openEdit(livePlan)} aria-label="Edit plan">
              <Pencil size={16} />
            </IconButton>
            <IconButton onClick={() => setPlanToDelete(livePlan)} aria-label="Delete plan" className="text-muted-foreground hover:text-destructive">
              <Trash2 size={16} />
            </IconButton>
          </div>
        </div>

        {/* Hero: what is paid, of what, and the bar */}
        <HeroCard className="mb-5">
          <p className="text-sm opacity-70">{hasLoan ? 'Principal paid' : 'Paid till now'}</p>
          <p className="mt-1 text-[2.5rem] leading-none font-medium tracking-tight tabular-nums">
            <BigAmount text={fmt(hasLoan ? paidPrincipal : paidPayments)} />
          </p>
          <p className="text-sm opacity-70 mt-1.5">of {fmt(hasLoan ? loanTotal : grossTotal)}</p>
          <div className="mt-4 h-1.5 rounded-full bg-[hsl(258_30%_8%/0.15)] overflow-hidden" role="progressbar" aria-label="Plan progress" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-[hsl(258_30%_8%)] transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <HeroChip label="Remaining" value={fmt(hasLoan ? remainingPrincipal : planLeft(plan))} />
            <HeroChip label="Done" value={`${progressPct}%`} />
            <HeroChip dark label="Paid" value={`${livePlan.paidInstallments}/${livePlan.totalInstallments}`} />
          </div>
        </HeroCard>

        {/* Stepper: mark statement instalments paid */}
        {!isDone && (
          <Tile className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-medium">Update paid installments</p>
              <p className="text-xs text-muted-foreground mt-0.5">When your card statement arrives</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <IconButton
                onClick={() => updateProgress(livePlan, -1)}
                disabled={livePlan.paidInstallments <= 0}
                aria-label="One fewer paid"
                className="bg-muted"
              >
                <Minus size={14} />
              </IconButton>
              <span className="text-base font-medium tabular-nums min-w-[56px] text-center">
                {livePlan.paidInstallments} / {livePlan.totalInstallments}
              </span>
              <IconButton
                tone="primary"
                onClick={() => updateProgress(livePlan, +1)}
                disabled={livePlan.paidInstallments >= livePlan.totalInstallments}
                aria-label="One more paid"
              >
                <Plus size={14} />
              </IconButton>
            </div>
          </Tile>
        )}

        {/* Detail rows */}
        <SectionLabel label="Details" />
        <div className="bg-card rounded-3xl divide-y divide-border mb-4">
          <DetailRow label="Monthly installment" value={fmt(plan.amountPerInstallment)} />
          <DetailRow label="Repayment period" value={`${plan.totalInstallments} month${plan.totalInstallments !== 1 ? 's' : ''}`} />
          {schedule && <DetailRow label="Started" value={format(schedule.startedOn, 'MMM yyyy')} />}
          {schedule && <DetailRow label="Next payment" value={format(schedule.nextDue, 'd MMM yyyy')} />}
          {schedule && <DetailRow label="Ends" value={format(schedule.endsOn, 'd MMM yyyy')} />}
          <DetailRow label="Remaining installments" value={String(remainingInstallments)} />
          <DetailRow label="Remaining payments" value={fmt(remainingPayments)} />
          {(hasLoan || plan.remainingPrincipal != null) && (
            <DetailRow label="Remaining principal" value={fmt(remainingPrincipal)} />
          )}
          {hasLoan && interestPerInstallment > 0 && (
            <DetailRow label="Remaining interest" value={fmt(remainingInterest)} />
          )}
          <DetailRow label="Paid so far" value={fmt(paidPayments)} />
          {plan.note && <DetailRow label="Description" value={plan.note} />}
        </div>

        <p className="text-center text-xs text-muted-foreground mb-6">
          {livePlan.paidInstallments} of {livePlan.totalInstallments} installments paid · {progressPct}% complete
        </p>

        {/* Delete dialog */}
        <AlertDialog open={!!planToDelete} onOpenChange={o => { if (!o) setPlanToDelete(null); }}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Installment Plan?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all transactions linked to <strong>{planToDelete && planDisplayName(planToDelete.merchant)}</strong>. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePlan}
                className="bg-destructive text-destructive-foreground hover:brightness-95"
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

  const monthlyTotal = activePlans.reduce((s, p) => s + p.amountPerInstallment, 0);

  return (
    <div className={`${NARROW_PAGE} pb-8`}>
      <PageHeader
        title="Installments"
        actions={
          <IconButton tone="primary" onClick={openAdd} aria-label="New plan" title="New plan">
            <Plus size={20} />
          </IconButton>
        }
      />

      {plans.length === 0 ? (
        <Tile className="text-center py-14 text-muted-foreground">
          <span className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <CreditCard size={24} className="opacity-60" />
          </span>
          <p className="font-medium">No installment plans yet</p>
        </Tile>
      ) : (
        <div className="space-y-6">
          {/* Hero: what the plans take each month */}
          <HeroCard>
            <p className="text-sm opacity-70">Monthly</p>
            <p className="mt-1 text-[2.5rem] leading-none font-medium tracking-tight tabular-nums">
              <BigAmount text={fmt(monthlyTotal)} />
            </p>
            <p className="text-sm opacity-70 mt-1.5">
              {activePlans.length} active plan{activePlans.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-5">
              <HeroChip className="col-span-2" dark label="Total left" value={fmt(totalRemaining)} />
              <HeroChip label="Plans" value={activePlans.length} />
            </div>
          </HeroCard>

          {/* Active plans: one tile each, like Orbix saving goals */}
          {activePlans.length > 0 && (
            <div>
              <SectionLabel label="Active" count={activePlans.length} />
              <div className="space-y-3">
                {activePlans.map(plan => {
                  const progress = Math.round((plan.paidInstallments / plan.totalInstallments) * 100);
                  const schedule = planSchedule(plan, accountOf(plan), now);
                  return (
                    <Tile key={plan.key} className="p-0">
                      <button
                        onClick={() => setSelectedPlan(plan)}
                        className="w-full text-left p-4 active:opacity-70"
                      >
                        <div className="flex items-center gap-3">
                          <IconTile value={plan.categoryIcon} className="w-11 h-11" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-medium line-clamp-2 break-words">{planDisplayName(plan.merchant)}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {plan.paidInstallments}/{plan.totalInstallments} paid · {accountOf(plan)?.name ?? plan.category}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[15px] font-medium tabular-nums tracking-tight">
                              <BigAmount text={fmt(plan.amountPerInstallment)} /><span className="text-xs text-muted-foreground font-normal">/mo</span>
                            </p>
                            <p className="text-xs font-medium text-primary mt-0.5">{progress}%</p>
                          </div>
                        </div>
                        <Meter value={progress} className="mt-3.5 h-1" label={`${planDisplayName(plan.merchant)} progress`} />
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-2.5 text-xs text-muted-foreground">
                          <span>
                            {schedule && <>Ends {format(schedule.endsOn, 'd MMM yyyy')} · </>}<span className="text-expense">{fmt(planLeft(plan))} left</span>
                          </span>
                          <span className="shrink-0 tabular-nums">{fmt(plan.paidAmount)} / {fmt(plan.totalAmount)}</span>
                        </div>
                      </button>
                    </Tile>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed plans: tucked away in one list card */}
          {completedPlans.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <button
                  onClick={() => setShowCompleted(v => !v)}
                  aria-expanded={showCompleted}
                  className="tap-area flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-[0.16em]"
                >
                  Completed · <span className="text-foreground">{completedPlans.length}</span>
                  <ChevronDown size={14} className={showCompleted ? 'rotate-180' : ''} />
                </button>
              </div>
              {showCompleted && (
                <ListCard>
                  {completedPlans.map(plan => (
                    <ListRow
                      key={plan.key}
                      onClick={() => setSelectedPlan(plan)}
                      icon={<AppIcon value={plan.categoryIcon} className="text-[18px]" />}
                      title={planDisplayName(plan.merchant)}
                      sub={`${plan.totalInstallments} payments · ${fmt(plan.totalAmount)} total`}
                      trailing={<CheckCircle2 size={16} className="text-income shrink-0" />}
                      className="opacity-70"
                    />
                  ))}
                </ListCard>
              )}
            </div>
          )}
        </div>
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
  <div className="flex items-center justify-between gap-3 px-4 py-3.5">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="text-sm font-medium tabular-nums text-right">{value}</p>
  </div>
);

export default Installments;
