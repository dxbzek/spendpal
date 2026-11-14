import { useState, useMemo, lazy, Suspense } from 'react';
import { useBalanceMask, dispatchBalanceMaskToggle } from '@/hooks/useBalanceMask';
import { getCategoryChartColor } from '@/utils/categoryColors';
import { budgetsForMonth } from '@/utils/budgets';
import { budgetPercent } from '@/lib/finance/budgetSpend';
import { isInPeriod } from '@/lib/today';
import { useToday } from '@/hooks/useToday';
import { availableCredit, creditUtilization } from '@/lib/finance/credit';
import { savingsSummary } from '@/lib/finance/pace';
import { pairTransfers } from '@/lib/finance/transfers';
import { grossSpending, isCountableExpense, isCountableIncome, netSpending, refundTotal } from '@/lib/finance/transactionFilters';
import RecurringTracker from '@/components/dashboard/RecurringTracker';
import RecurringDueBanner from '@/components/dashboard/RecurringDueBanner';
import UpcomingBillsWidget from '@/components/dashboard/UpcomingBillsWidget';
import SpendingForecastWidget from '@/components/dashboard/SpendingForecastWidget';
import CreditUtilizationWidget from '@/components/dashboard/CreditUtilizationWidget';
import ExpenseByAccountTypeWidget from '@/components/dashboard/ExpenseByAccountTypeWidget';
import MonthlyComparisonWidget from '@/components/dashboard/MonthlyComparisonWidget';
import { useFinance } from '@/context/FinanceContext';

import { useCurrency } from '@/context/CurrencyContext';
import { WORLD_CURRENCIES } from '@/utils/currencies';
import { Eye, EyeOff, Plus, ChevronRight, Trash2, Edit2, Search, Wallet, CheckCircle2, ArrowUpRight, ArrowDown, Coins } from 'lucide-react';
import logo from '@/assets/logo.png';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { m } from 'framer-motion';
import { useBudgetAlerts } from '@/hooks/useBudgetAlerts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCountUp } from '@/hooks/useCountUp';
import AddAccountDialog from '@/components/forms/AddAccountDialog';
import CardPaymentsCard from '@/components/dashboard/CardPaymentsCard';
import ChargeAlertsCard from '@/components/dashboard/ChargeAlertsCard';
import { spendableCash } from '@/lib/finance/cardPayments';
import { buildPlans, totalLeft } from '@/lib/finance/installments';
import { ordinal } from '@/lib/ordinal';
import { useAuth } from '@/context/AuthContext';
import { useEditTransaction } from '@/components/layout/AppLayout';
import CurrencyStep from '@/components/onboarding/CurrencyStep';
import GettingStartedCard from '@/components/dashboard/GettingStartedCard';
import {
  OPEN_ADD_STATE, checklistDismissedKey, checklistSteps, currencyConfirmedKey, needsCurrencyStep, readFlag,
  showChecklist, writeFlag, type ChecklistStepId,
} from '@/lib/onboarding';
import { ACCOUNT_TYPE_GROUP_NAMES, PAGE_NAMES } from '@/lib/pageNames';
// Charts pull in ~400 kB of recharts+d3. Defer them so the first Dashboard
// paint doesn't block on that graph code.
const SpendingPieChart = lazy(() => import('@/components/charts/SpendingPieChart'));
const MonthlyTrendChart = lazy(() => import('@/components/charts/MonthlyTrendChart'));
import type { Account } from '@/types/finance';

const ChartSkeleton = ({ height = 'h-[220px]' }: { height?: string }) => (
  <div className={`${height} w-full rounded-xl bg-muted animate-pulse`} />
);
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { IconTile } from '@/components/AppIcon';


// Hoisted out of the component so it's a stable type — defining it inline in
// render made React remount every card (and re-run their effects) each render.
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-card rounded-xl p-4 card-shadow transition-shadow duration-200 hover:card-shadow-hover ${className}`}>{children}</div>
);

const Dashboard = () => {
  const { accounts, transactions, budgets, goals, removeAccount, loading: dataLoading } = useFinance();
  
  const { fmt, fmtSigned, currency: userCurrency, fmtSecondary, secondaryCurrency, setSecondaryCurrency } = useCurrency();
  const isMobile = useIsMobile();
  const [secSearch, setSecSearch] = useState('');
  const filteredSecCurrencies = secSearch
    ? WORLD_CURRENCIES.filter(c => c.code.toLowerCase().includes(secSearch.toLowerCase()) || c.label.toLowerCase().includes(secSearch.toLowerCase()))
    : WORLD_CURRENCIES;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openAddSheet } = useEditTransaction();
  // First-use flags, per user, in this browser (see lib/onboarding).
  const [currencyConfirmed, setCurrencyConfirmed] = useState(() => !!user && readFlag(currencyConfirmedKey(user.id)));
  const [checklistDismissed, setChecklistDismissed] = useState(() => !!user && readFlag(checklistDismissedKey(user.id)));
  // Shared hook keeps the balance mask in sync across the app.
  const { hidden, mask } = useBalanceMask();
  const toggleHidden = () => dispatchBalanceMaskToggle(!hidden);
  const [period, setPeriod] = useState<'month' | 'year' | 'all'>('month');
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  // Today's date, kept current while Home stays open. Fixed on mount, it left
  // out rows added after midnight and stayed on last month after a month change.
  const today = useToday();
  const monthKey = today.slice(0, 7);
  // This month's own budgets, the same set the Budgets page shows. Last
  // month's are not carried forward here: Home showed "% spent" against them
  // while the Budgets page said the month had none.
  const activeBudgetsList = useMemo(() => budgetsForMonth(budgets, monthKey), [budgets, monthKey]);
  useBudgetAlerts(activeBudgetsList);

  // Same figure "Left until payday" starts from: cash/debit, minus savings
  // marked not-for-spending, minus pending holds (authorised, not yet out of
  // the balance).
  const spendable = useMemo(() => spendableCash(accounts, transactions), [accounts, transactions]);
  const totalBalance = spendable.available;
  const animatedBalance = useCountUp(totalBalance, 700);
  const sec = (n: number) => { const s = fmtSecondary(n); return s && !hidden ? s : null; };

  // Future-dated rows are left out: not spent or earned yet.
  const filtered = useMemo(
    () => transactions.filter(tx => isInPeriod(tx.date, period, today)),
    [transactions, period, today],
  );

  const creditAccountIds = useMemo(() => new Set(accounts.filter(a => a.type === 'credit').map(a => a.id)), [accounts]);
  const income = useMemo(() => filtered.filter(t => isCountableIncome(t, creditAccountIds)).reduce((s, t) => s + t.amount, 0), [filtered, creditAccountIds]);
  // Spending after refunds. A refund is an income row, but it is money back
  // for a purchase: it lowers spending and is never counted as income.
  const expenses = useMemo(() => netSpending(filtered), [filtered]);
  const refunds = useMemo(() => refundTotal(filtered), [filtered]);
  // Before refunds: the base for the category shares, which cannot take a
  // refund off (a refund row does not say which category it undoes).
  const grossExpenses = useMemo(() => grossSpending(filtered), [filtered]);
  const animatedIncome = useCountUp(income, 700);
  const animatedExpenses = useCountUp(expenses, 700);

  const categorySpending = useMemo(() => {
    const map: Record<string, { icon: string; total: number }> = {};
    filtered.filter(isCountableExpense).forEach(t => {
      if (!map[t.category]) map[t.category] = { icon: t.categoryIcon, total: 0 };
      map[t.category].total += t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const [thisMonthIncome, thisMonthExpenses] = useMemo(() => {
    // Future-dated rows are skipped by isInPeriod: not spent or earned yet.
    const rows = transactions.filter(tx => isInPeriod(tx.date, 'month', today));
    const inc = rows.reduce((s, tx) => (isCountableIncome(tx, creditAccountIds) ? s + tx.amount : s), 0);
    // After refunds, like the Expenses figure above.
    return [inc, netSpending(rows)];
  }, [transactions, today, creditAccountIds]);
  const savings = savingsSummary(thisMonthIncome, thisMonthExpenses);
  // Note: the financial-health score now lives solely on the AI Advisor page,
  // where it is actually computed — per the SpendPal design handoff.

  const totalBudgeted = activeBudgetsList.reduce((s, b) => s + b.amount, 0);
  const totalSpent = activeBudgetsList.reduce((s, b) => s + b.spent, 0);
  const budgetPct = budgetPercent(totalSpent, totalBudgeted);

  // Installment plan summary — the same plans and "left" as the Installments page.
  const installmentSummary = useMemo(() => {
    const active = buildPlans(transactions).filter(p => p.paidInstallments < p.totalInstallments);
    return {
      count: active.length,
      monthlyTotal: Math.round(active.reduce((s, p) => s + p.amountPerInstallment, 0) * 100) / 100,
      totalRemaining: totalLeft(active),
    };
  }, [transactions]);

  // The two halves of a transfer show as one row, paired the same way as on
  // the Transactions page: on the transfer id, older rows on date + amount +
  // note (see transfers.ts). Date + amount alone crossed two equal transfers
  // made on one day and showed the wrong destination account.
  const recentTx = useMemo(() => {
    const pairs = pairTransfers(transactions);
    const incomeHalves = new Set([...pairs.values()].map(p => p.to.id));
    return transactions
      .filter(tx => !incomeHalves.has(tx.id))
      .slice(0, 5)
      .map(tx => ({ ...tx, toAccountId: pairs.get(tx.id)?.to.accountId }));
  }, [transactions]);


  const counts = { accounts: accounts.length, transactions: transactions.length, budgets: budgets.length, goals: goals.length };
  const steps = checklistSteps(counts);
  // The oldest row says how long the user has been here (see showChecklist).
  const oldestTxDate = transactions.length ? transactions.reduce((min, t) => (t.date < min ? t.date : min), transactions[0].date) : null;
  const checklistVisible = showChecklist(steps, checklistDismissed, oldestTxDate, today);

  const runStep = (id: ChecklistStepId) => {
    if (id === 'account') { setEditAccount(null); setShowAddAccount(true); }
    else if (id === 'transaction') openAddSheet();
    else if (id === 'budget') navigate('/budgets', { state: OPEN_ADD_STATE });
    else navigate('/goals', { state: OPEN_ADD_STATE });
  };
  const dismissChecklist = () => {
    setChecklistDismissed(true);
    if (user) writeFlag(checklistDismissedKey(user.id));
  };

  // Skeleton keeps the layout stable while data loads.
  if (dataLoading) {
    return (
      <div>
        <div className="bg-primary px-5 md:px-8 pt-12 pb-8 rounded-b-2xl">
          <Skeleton className="h-6 w-40 bg-primary-raised mb-4" />
          <Skeleton className="h-10 w-48 bg-primary-raised mb-2" />
          <Skeleton className="h-4 w-28 bg-primary-raised" />
        </div>
        <div className="px-5 md:px-8 mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
          <Skeleton className="col-span-2 lg:col-span-4 h-48 rounded-xl" />
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i + 4} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // First run: no accounts yet. A brand-new user picks a currency first, so
  // the first account is not saved in AED by default; anyone who already has
  // records skips it (they change currency in Settings, with conversion).
  if (!dataLoading && accounts.length === 0) {
    const askCurrency = needsCurrencyStep(counts, currencyConfirmed);
    // The currency row shows only to someone who is or was asked: marking it
    // Done for a user who skipped it would say they chose one.
    const firstRun = [
      ...(askCurrency || currencyConfirmed ? [{ icon: Coins, label: 'Choose your currency', hint: 'Used for every amount', done: !askCurrency }] : []),
      { icon: Wallet, label: steps[0].label, hint: steps[0].hint, done: false },
    ];
    return (
      <div className="px-5 md:px-8 pt-12 pb-8 max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Wallet size={36} className="text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-heading mb-2">Welcome to SpendPal!</h1>
          <p className="text-muted-foreground text-sm">
            {firstRun.length > 1 ? 'Two steps to start: your currency, then your first account.' : 'Add your first account to start.'}
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {firstRun.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className={`flex items-center gap-4 p-4 rounded-xl card-shadow transition-all ${step.done ? 'bg-income-soft border border-income-line' : 'bg-card'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${step.done ? 'bg-income-soft' : 'bg-accent'}`}>
                  {step.done
                    ? <CheckCircle2 size={20} className="text-income" />
                    : <Icon size={18} className="text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${step.done ? 'line-through text-muted-foreground' : ''}`}>{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.hint}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${step.done ? 'bg-income-soft text-income' : 'bg-muted text-muted-foreground'}`}>
                  {step.done ? 'Done' : `Step ${i + 1}`}
                </span>
              </div>
            );
          })}
        </div>

        {askCurrency ? (
          <CurrencyStep onSaved={() => { setCurrencyConfirmed(true); setShowAddAccount(true); }} />
        ) : (
          <button
            onClick={() => setShowAddAccount(true)}
            className="w-full h-14 bg-primary text-primary-foreground rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-transform"
          >
            <Plus size={20} />
            Add your first account
          </button>
        )}

        <AddAccountDialog
          open={showAddAccount}
          onOpenChange={(open) => { setShowAddAccount(open); if (!open) setEditAccount(null); }}
          editAccount={editAccount}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className={`bg-primary px-5 md:px-8 ${isMobile ? 'pt-12 pb-8 rounded-b-2xl' : 'pt-8 pb-6'}`}>
        <div className={`${isMobile ? '' : 'max-w-5xl mx-auto'}`}>
          <div className={`flex items-center justify-between ${isMobile ? 'mb-6' : 'mb-4'}`}>
            <div className="flex items-center gap-4 min-w-0">
              <img src={logo} alt="" className="w-9 h-9 rounded-full object-contain bg-primary-raised p-0.5 shrink-0" />
              <div className="min-w-0">
                <h1 className="text-base font-heading font-bold text-primary-foreground leading-tight">{PAGE_NAMES['/']}</h1>
              </div>
            </div>
            <button onClick={toggleHidden} className="text-primary-subtle p-2 -mr-2 rounded-lg" role="switch" aria-checked={hidden} aria-label={hidden ? 'Show balance' : 'Hide balance'}>
              {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-primary-subtle text-xs uppercase tracking-wider mb-1">Spendable Cash</p>
              <p className="text-financial-hero text-primary-foreground">{hidden ? '••••••' : fmt(animatedBalance)}</p>
              {sec(totalBalance) && <p className="text-sm text-primary-subtle mt-0.5">≈ {sec(totalBalance)}</p>}
              {spendable.holds > 0 && (
                <p className="text-xs text-primary-subtle mt-0.5">After {mask(fmt(spendable.holds))} in pending holds</p>
              )}
            </div>

            {/* Secondary currency — chosen in Settings; switchable here once set */}
            {secondaryCurrency && (
            <Select value={secondaryCurrency} onValueChange={v => setSecondaryCurrency(v === '__none__' ? null : v)}>
              <SelectTrigger className="h-7 shrink-0 w-auto min-w-[78px] max-w-[110px] sm:max-w-[140px] bg-primary-raised border-0 text-primary-subtle text-xs rounded-full px-3 gap-1">
                <SelectValue placeholder="2nd currency" />
              </SelectTrigger>
              <SelectContent className="max-h-[240px]">
                <div className="px-2 pb-2 sticky top-0 bg-popover z-10">
                  <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="text" placeholder="Search…" value={secSearch} onChange={e => setSecSearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-input bg-background text-foreground outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </div>
                <SelectItem value="__none__">None</SelectItem>
                {filteredSecCurrencies.filter(c => c.code !== userCurrency).map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 -mt-4 pb-8">
        {checklistVisible && <GettingStartedCard steps={steps} onStep={runStep} onDismiss={dismissChecklist} />}

        {/* What each card's statement asks for, exactly as entered */}
        <CardPaymentsCard
          accounts={accounts}
          transactions={transactions}
          mask={mask}
          onEditAccount={(a) => { setEditAccount(a); setShowAddAccount(true); }}
        />

        {/* Fees paid and recurring bills that went up */}
        <ChargeAlertsCard transactions={transactions} mask={mask} />

        {/* Alerts */}
        <div className="mb-4">
          <RecurringDueBanner transactions={transactions} />
        </div>

        {/* Section divider helper */}
        {/* ── OVERVIEW ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-4 pt-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Income and expenses</span>
            <div className="flex-1 h-px bg-border" />
            <div className="flex gap-0.5 p-0.5 bg-muted rounded-lg shrink-0">
              {(['all', 'month', 'year'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    period === p ? 'bg-card text-foreground card-shadow' : 'text-muted-foreground'
                  }`}>
                  {p === 'all' ? 'All' : p === 'month' ? 'Month' : 'Year'}
                </button>
              ))}
            </div>
          </div>

          <Card className="col-span-1 overflow-hidden">
            <div className="w-[26px] h-[26px] rounded-lg bg-income/[0.12] text-income flex items-center justify-center mb-2"><ArrowUpRight size={15} /></div>
            <p className="text-xs text-muted-foreground mb-1">Income</p>
            <p className="text-financial-medium text-income tabular-nums">{mask(fmt(animatedIncome))}</p>
            {sec(income) && <p className="text-xs text-muted-foreground truncate">≈ {sec(income)}</p>}
          </Card>
          <Card className="col-span-1 overflow-hidden">
            <div className="w-[26px] h-[26px] rounded-lg bg-expense/[0.12] text-expense flex items-center justify-center mb-2"><ArrowDown size={15} /></div>
            <p className="text-xs text-muted-foreground mb-1">Expenses</p>
            <p className="text-financial-medium text-expense tabular-nums">{mask(fmt(animatedExpenses))}</p>
            {sec(expenses) && <p className="text-xs text-muted-foreground truncate">≈ {sec(expenses)}</p>}
            {refunds > 0 && <p className="text-xs text-muted-foreground truncate">After {mask(fmt(refunds))} in refunds</p>}
          </Card>

          {savings.kind === 'saved' && (
            <Card className="col-span-2 lg:col-span-4 border-t-2 border-t-primary">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Savings Rate — This Month</p>
                  <p className={`text-financial-medium ${savings.rate >= 20 ? 'text-income' : 'text-warning'}`}>
                    {hidden ? '••' : `${savings.rate}%`}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Saved: {mask(fmt(savings.amount))}</p>
                  <p className="text-xs">{savings.rate >= 20 ? 'On track' : 'Room to save'}</p>
                </div>
              </div>
              {!hidden && (
                <div className="h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-label="Savings rate" aria-valuenow={savings.rate} aria-valuemin={0} aria-valuemax={100}>
                  <div
                    className={`h-full rounded-full transition-all ${savings.rate >= 20 ? 'bg-income' : 'bg-warning'}`}
                    style={{ width: `${Math.min(savings.rate, 100)}%` }}
                  />
                </div>
              )}
            </Card>
          )}
          {/* A rate against a small income is noise ("-3050%"): show the gap in money. */}
          {savings.kind === 'overspent' && (
            <Card className="col-span-2 lg:col-span-4 border-t-2 border-t-expense">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">This month so far</p>
                  <p className="text-financial-medium text-expense">{mask(fmt(savings.amount))}</p>
                  <p className="text-xs text-muted-foreground">more went out than came in</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>In: {mask(fmt(thisMonthIncome))}</p>
                  <p>Out: {mask(fmt(thisMonthExpenses))}</p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* ── ACCOUNTS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 mt-6">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Accounts</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Card className="col-span-2 lg:col-span-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-sm">Accounts</h2>
              <button onClick={() => { setEditAccount(null); setShowAddAccount(true); }} className="tap-area text-xs text-primary font-medium flex items-center gap-1">
                <Plus size={14} /> Add
              </button>
            </div>
            <div className="space-y-4">
              {(['cash', 'debit', 'credit'] as const).map(accountType => {
                const group = accounts.filter(a => a.type === accountType);
                if (group.length === 0) return null;
                return (
                  <div key={accountType}>
                    <p className="text-xs font-medium text-muted-foreground mb-2">{ACCOUNT_TYPE_GROUP_NAMES[accountType]}</p>
                    <div className="space-y-5">
                      {group.map(a => {
                        // balance IS the amount owed for credit accounts.
                        const spent = a.type === 'credit' ? a.balance : 0;
                        const available = availableCredit(a);
                        const utilization = Math.round(creditUtilization(a) ?? 0);
                        const utilizationColor = utilization > 75 ? 'bg-expense' : utilization > 50 ? 'bg-warning' : 'bg-primary';
                        return (
                          <div key={a.id} className="group">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-4 min-w-0">
                                <IconTile value={a.icon} />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium line-clamp-2 break-words">{a.name}</p>
                                  {a.type === 'credit' && (
                                    <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                                      {a.statementDate && a.statementDate > 0 && <span>Stmt: {ordinal(a.statementDate)}</span>}
                                      {a.dueDate && <span>Due: {ordinal(a.dueDate)}</span>}
                                      {a.creditLimit != null && <span>Limit: {fmt(a.creditLimit)}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <div className="text-right">
                                  <p className="font-heading text-sm">{mask(fmt(a.balance))}</p>
                                  {sec(a.balance) && <p className="text-[11px] text-muted-foreground">≈ {sec(a.balance)}</p>}
                                  {a.type === 'credit' && (
                                    <p className="text-xs font-medium text-primary">
                                      Owed{available != null ? ` · ${fmt(available)} available` : ''}
                                    </p>
                                  )}
                                </div>
                                <button onClick={() => { setEditAccount(a); setShowAddAccount(true); }} className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-1">
                                  <Edit2 size={14} />
                                </button>
                                <button onClick={() => setDeleteAccountId(a.id)} className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            {a.type === 'credit' && a.creditLimit != null && (
                              <div className="mt-1.5 ml-11">
                                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                  <span>{utilization}% used</span>
                                  <span>{fmt(spent)} / {fmt(a.creditLimit)}</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${utilizationColor}`} style={{ width: `${utilization}%` }} />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {accounts.length === 0 && <p className="text-sm text-muted-foreground text-center py-2">No accounts yet. Add one to get started!</p>}
            </div>
          </Card>
        </div>

        {/* ── SPENDING ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 mt-6">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Spending</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {categorySpending.length > 0 && (
            <Card className="col-span-2 lg:col-span-2">
              <h2 className="font-heading text-sm mb-3">Breakdown</h2>
              <Suspense fallback={<ChartSkeleton height="aspect-square max-w-[180px]" />}>
                <SpendingPieChart data={categorySpending.map(([cat, data]) => ({ name: cat, value: data.total, icon: data.icon }))} />
              </Suspense>
            </Card>
          )}

          {transactions.length > 0 && (
            <Card className="col-span-2 lg:col-span-2">
              <h2 className="font-heading text-sm mb-3">Monthly Trends</h2>
              <Suspense fallback={<ChartSkeleton />}>
                <MonthlyTrendChart transactions={transactions} creditAccountIds={creditAccountIds} />
              </Suspense>
            </Card>
          )}

          {categorySpending.length > 0 && (
            <Card className="col-span-2 lg:col-span-2">
              <h2 className="font-heading text-sm mb-3">By Category</h2>
              <div className="space-y-2.5">
                {categorySpending.slice(0, 5).map(([cat, data], idx) => {
                  const pct = grossExpenses ? Math.round((data.total / grossExpenses) * 100) : 0;
                  const barColor = getCategoryChartColor(cat, idx);
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="text-sm flex items-center gap-2 min-w-0" title={cat}>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: barColor }} />
                          <span className="truncate">{cat}</span>
                        </span>
                        <span className="text-sm font-medium shrink-0">{fmt(data.total)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <m.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full rounded-full" style={{ backgroundColor: barColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <div className="col-span-2 lg:col-span-2">
            <ExpenseByAccountTypeWidget accounts={accounts} transactions={filtered} hidden={hidden} mask={mask} />
          </div>

          <div className="col-span-2 lg:col-span-4">
            <MonthlyComparisonWidget accounts={accounts} transactions={transactions} hidden={hidden} mask={mask} />
          </div>
        </div>

        {/* ── PLANNING ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 mt-6">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Planning</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Card className="col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading text-sm">Budget Overview</h2>
              <button onClick={() => navigate('/budgets')} className="tap-area text-xs text-primary font-medium flex items-center gap-0.5">View all <ChevronRight size={14} /></button>
            </div>
            {activeBudgetsList.length === 0 ? (
              /* Same message as the Budgets page, where Copy and Rollover live. */
              <div className="text-xs text-muted-foreground">
                <p className="mb-2">No budgets for {format(parseISO(today), 'MMMM')} yet.</p>
                <button onClick={() => navigate('/budgets')} className="tap-area text-xs text-primary font-medium">
                  Set up this month's budgets
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{budgetPct}% spent</span><span>{fmt(totalSpent)} / {fmt(totalBudgeted)}</span>
                </div>
                <div className="h-4 bg-muted rounded-full overflow-hidden mb-3">
                  <m.div initial={{ width: 0 }} animate={{ width: `${Math.min(budgetPct, 100)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={`h-full rounded-full ${budgetPct > 90 ? 'bg-expense' : 'bg-primary'}`} />
                </div>
                {activeBudgetsList.filter(b => b.amount > 0).sort((a, b) => (b.spent / b.amount) - (a.spent / a.amount)).slice(0, 3).map(b => {
                  // The real percentage: 776.71 of 400 reads 194%, not 100%. Only the bar stops at full.
                  const pct = budgetPercent(b.spent, b.amount);
                  const barPct = Math.min(pct, 100);
                  return (
                    <div key={b.id} className="mb-2 last:mb-0">
                      <div className="flex items-center justify-between text-xs mb-0.5 gap-2">
                        <span className="text-muted-foreground truncate min-w-0" title={b.category}>{b.category}</span>
                        <span className={`font-medium shrink-0 ${pct >= 100 ? 'text-expense' : pct > 75 ? 'text-warning' : 'text-muted-foreground'}`}>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <m.div initial={{ width: 0 }} animate={{ width: `${barPct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }}
                          className={`h-full rounded-full ${pct >= 100 ? 'bg-expense' : pct > 75 ? 'bg-warning' : 'bg-primary'}`} />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </Card>

          <div className="col-span-2 lg:col-span-2">
            <CreditUtilizationWidget accounts={accounts} hidden={hidden} mask={mask} />
          </div>

          <div className="col-span-2 lg:col-span-2">
            <UpcomingBillsWidget accounts={accounts} transactions={transactions} />
          </div>

          {installmentSummary.count > 0 && (
            <Card className="col-span-2 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-sm">Installment Plans</h2>
                <button onClick={() => navigate('/installments')} className="tap-area text-xs text-primary font-medium flex items-center gap-0.5">View all <ChevronRight size={14} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-primary">{installmentSummary.count}</p>
                  <p className="text-xs text-muted-foreground">Active plans</p>
                </div>
                <div>
                  <p className="text-sm font-bold">{mask(fmt(installmentSummary.monthlyTotal))}</p>
                  <p className="text-xs text-muted-foreground">Monthly</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-expense">{mask(fmt(installmentSummary.totalRemaining))}</p>
                  <p className="text-xs text-muted-foreground">Total left</p>
                </div>
              </div>
            </Card>
          )}

          <div className="col-span-2 lg:col-span-4">
            <RecurringTracker />
          </div>
        </div>

        {/* ── INSIGHTS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 mt-6">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Insights</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="col-span-2 lg:col-span-2">
            <SpendingForecastWidget transactions={transactions} />
          </div>

          {recentTx.length > 0 && (
            <Card className="col-span-2 lg:col-span-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-sm">Recent Transactions</h2>
                <button onClick={() => navigate('/transactions')} className="tap-area text-xs text-primary font-medium flex items-center gap-0.5">View all <ChevronRight size={14} /></button>
              </div>
              <div className="space-y-5">
                {recentTx.map(tx => {
                  const isTransfer = tx.category === 'Transfer';
                  const toAccName = tx.toAccountId ? (accounts.find(a => a.id === tx.toAccountId)?.name || '') : null;
                  const fromAccName = isTransfer ? (accounts.find(a => a.id === tx.accountId)?.name || '') : null;
                  return (
                    <div key={tx.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <IconTile value={tx.categoryIcon} />
                        <div>
                          <p className="text-sm font-medium">{isTransfer ? 'Transfer' : tx.merchant}</p>
                          {isTransfer && toAccName ? (
                            <p className="text-xs text-muted-foreground">{fromAccName} → {toAccName}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">{format(parseISO(tx.date), 'MMM d, yyyy')}</p>
                          )}
                        </div>
                      </div>
                      <p className={`text-sm font-heading ${isTransfer ? 'text-muted-foreground' : tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                        {fmtSigned(tx.amount, isTransfer ? 'transfer' : tx.type as 'income' | 'expense')}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>

      <AddAccountDialog open={showAddAccount} onOpenChange={setShowAddAccount} editAccount={editAccount} />

      <AlertDialog open={!!deleteAccountId} onOpenChange={(o) => { if (!o) setDeleteAccountId(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>This will also delete all transactions linked to this account. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteAccountId) removeAccount(deleteAccountId); setDeleteAccountId(null); }}
              className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
