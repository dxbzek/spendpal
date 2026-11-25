import { useState, useMemo, lazy, Suspense } from 'react';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { getCategoryChartColor } from '@/utils/categoryColors';
import { budgetsForMonth } from '@/utils/budgets';
import { budgetPercent } from '@/lib/finance/budgetSpend';
import { isInPeriod } from '@/lib/today';
import { useToday } from '@/hooks/useToday';
import { creditUtilization } from '@/lib/finance/credit';
import { savingsSummary } from '@/lib/finance/pace';
import { pairTransfers } from '@/lib/finance/transfers';
import { grossSpending, incomeAndSpending, isCountableExpense } from '@/lib/finance/transactionFilters';
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
import { Eye, EyeOff, Plus, ChevronRight, Trash2, Search, Wallet, CheckCircle2, Coins } from 'lucide-react';
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
import { useEditTransaction } from '@/components/layout/AppLayout';
import CurrencyStep from '@/components/onboarding/CurrencyStep';
import GettingStartedCard from '@/components/dashboard/GettingStartedCard';
import {
  OPEN_ADD_STATE, checklistSteps, needsCurrencyStep, showChecklist, type ChecklistStepId,
} from '@/lib/onboarding';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useAuth } from '@/context/AuthContext';
import { BigAmount } from '@/components/orbix';
import { userSettings } from '@/lib/userSettings';
import { PAGE_NAMES } from '@/lib/pageNames';
// Charts pull in ~400 kB of recharts+d3. Defer them so the first Dashboard
// paint doesn't block on that graph code.
const SpendingPieChart = lazy(() => import('@/components/charts/SpendingPieChart'));
const MonthlyTrendChart = lazy(() => import('@/components/charts/MonthlyTrendChart'));
import type { Account } from '@/types/finance';

// Home's card sections. A flex row, not a 4-column grid: a half-width card
// with no partner (Installment Plans, Spending Forecast) grows to the full
// row instead of sitting beside an empty half, and a widget that renders
// nothing leaves its slot empty, which empty:hidden removes. A section whose
// cards are all empty hides its title too.
const SECTION = 'flex flex-wrap gap-4 lg:gap-5 mt-4 lg:mt-5 [&:not(:has(>:not(:empty)))]:hidden';
// Half a row from lg up (50% less half the 1.25rem gap), a full row below.
const HALF = 'min-w-0 grow basis-full lg:basis-[calc(50%-0.625rem)]';
const FULL = 'min-w-0 basis-full';
// Slots for widgets that may render nothing; their card fills the slot height.
const HALF_SLOT = `${HALF} empty:hidden [&>*]:h-full`;
const FULL_SLOT = `${FULL} empty:hidden`;

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
  <div className={`bg-card rounded-3xl p-4 card-shadow transition-shadow duration-200 hover:card-shadow-hover ${className}`}>{children}</div>
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
  const { openAddSheet } = useEditTransaction();
  // First-use flags are user settings, so they follow the user to another device.
  const { data: settings, ready: settingsReady } = useUserSettings();
  const currencyConfirmed = settings.currency_confirmed === true;
  // Until the settings row has loaded, a card the user hid on another device
  // must not flash up and vanish, so the card waits for it.
  const checklistDismissed = settings.checklist_dismissed === true || !settingsReady;
  // Shared hook keeps the balance mask in sync across the app.
  const { hidden, mask, setBalancesHidden } = useBalanceMask();
  const toggleHidden = () => setBalancesHidden(!hidden);
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
  // Spending after refunds. A refund is an income row, but it is money back
  // for a purchase: it lowers spending and is never counted as income.
  const { income, spending: expenses } = useMemo(
    () => incomeAndSpending(filtered, creditAccountIds),
    [filtered, creditAccountIds],
  );
  // Before refunds: the base for the category shares, which cannot take a
  // refund off (a refund row does not say which category it undoes).
  const grossExpenses = useMemo(() => grossSpending(filtered), [filtered]);

  const categorySpending = useMemo(() => {
    const map: Record<string, { icon: string; total: number }> = {};
    filtered.filter(isCountableExpense).forEach(t => {
      if (!map[t.category]) map[t.category] = { icon: t.categoryIcon, total: 0 };
      map[t.category].total += t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const savings = savingsSummary(income, expenses);
  // Hero bars: spending per day (1M) or per month (YTD, 12M).
  const bars = useMemo(() => {
    const spend = filtered.filter(isCountableExpense);
    const keys: string[] = [];
    if (period === 'month') {
      const n = Number(today.slice(8, 10));
      for (let d = 1; d <= n; d++) keys.push(`${monthKey}-${String(d).padStart(2, '0')}`);
    } else {
      const y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7));
      const count = period === 'year' ? mo : 12;
      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(y, mo - 1 - i, 1);
        keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
    }
    const len = period === 'month' ? 10 : 7;
    const totals = new Map(keys.map(k => [k, 0]));
    spend.forEach(t => { const k = t.date.slice(0, len); if (totals.has(k)) totals.set(k, (totals.get(k) ?? 0) + t.amount); });
    const rows = keys.map(k => ({ key: k, total: totals.get(k) ?? 0 }));
    const max = Math.max(1, ...rows.map(r => r.total));
    const peak = rows.reduce((a, b) => (b.total > a.total ? b : a), rows[0]);
    return { rows, max, peak };
  }, [filtered, period, today, monthKey]);
  const { user } = useAuth();
  const name = (user?.user_metadata?.display_name as string | undefined)?.split(' ')[0] ?? null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const periodShort = period === 'month' ? format(parseISO(today), 'MMM') : period === 'year' ? today.slice(0, 4) : '12M';
  // Chips are a third of the card: drop the decimals there.
  const fmtCompact = (n: number) => fmt(Math.round(n)).replace(/[.,]00(?=\D*$)/, '');
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
    userSettings.set('checklist_dismissed', true);
  };

  // Skeleton keeps the layout stable while data loads.
  if (dataLoading) {
    return (
      <div>
        <div className="px-4 md:px-8 pt-16 pb-4">
          <Skeleton className="h-10 w-40 mb-4 rounded-full" />
          <Skeleton className="h-52 w-full rounded-[28px]" />
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
          <CurrencyStep onSaved={() => setShowAddAccount(true)} />
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
      {/* Header: Orbix look (2026-11-24). Greeting row, then a gradient
          card with the balance and this month's in / out / saved. */}
      <div className={`px-4 md:px-8 ${isMobile ? 'pt-[calc(env(safe-area-inset-top,0px)+20px)]' : 'pt-8'}`}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <img src={logo} alt="" className="w-10 h-10 rounded-full object-contain bg-card p-1 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground leading-tight">{greeting}</p>
                <h1 className="sr-only">{PAGE_NAMES['/']}</h1>
                <p aria-hidden="true" className="text-lg font-heading font-semibold text-foreground leading-tight truncate">{name ?? PAGE_NAMES['/']}</p>
              </div>
            </div>
            <button onClick={toggleHidden} className="w-11 h-11 rounded-full bg-card flex items-center justify-center text-foreground" role="switch" aria-checked={hidden} aria-label={hidden ? 'Show balance' : 'Hide balance'}>
              {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="bg-hero rounded-[28px] p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium opacity-80">Spendable cash</p>
              {/* Secondary currency — chosen in Settings; switchable here once set */}
              {secondaryCurrency && (
              <Select value={secondaryCurrency} onValueChange={v => setSecondaryCurrency(v === '__none__' ? null : v)}>
                <SelectTrigger className="h-7 shrink-0 w-auto min-w-[72px] max-w-[110px] hero-chip border-0 text-[hsl(258_30%_8%)] text-xs rounded-full px-3 gap-1">
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
            <p className="text-financial-hero mt-1">
              {hidden ? '••••••' : <BigAmount text={fmt(animatedBalance)} />}
            </p>
            {sec(totalBalance) && <p className="text-sm opacity-70 mt-0.5">≈ {sec(totalBalance)}</p>}
            {spendable.holds > 0 && (
              <p className="text-xs opacity-70 mt-0.5">After {mask(fmt(spendable.holds))} in pending holds</p>
            )}

            {/* Period switch, Orbix style: translucent track, dark pill */}
            <div className="hero-chip rounded-full p-1 grid grid-cols-3 mt-4" role="tablist" aria-label="Period">
              {(['month', 'year', 'all'] as const).map(p => (
                <button key={p} role="tab" aria-selected={period === p} onClick={() => setPeriod(p)}
                  className={`h-8 rounded-full text-xs font-medium transition-colors ${period === p ? 'hero-chip-dark' : 'opacity-70'}`}>
                  {p === 'month' ? '1M' : p === 'year' ? 'YTD' : '12M'}
                </button>
              ))}
            </div>

            {/* Spending bars; the biggest one carries its amount */}
            {!hidden && bars.peak && bars.peak.total > 0 && (
              <div className="relative h-28 mt-4 flex items-end gap-[3px]" aria-label="Spending over the period">
                {bars.rows.map(r => {
                  const isPeak = r.key === bars.peak.key;
                  const label = format(parseISO(r.key.length === 7 ? `${r.key}-01` : r.key), r.key.length === 7 ? 'MMM' : 'd MMM');
                  return (
                    <div key={r.key} className="relative flex-1 h-full flex items-end">
                      <div className={`w-full rounded-full ${isPeak ? 'bg-[hsl(258_30%_8%)]' : 'bg-[hsl(258_30%_8%/0.22)]'}`}
                        style={{ height: `${Math.max(4, (r.total / bars.max) * 72)}%` }} />
                      {isPeak && (
                        <span className="absolute bottom-[calc(72%+8px)] left-1/2 -translate-x-1/2 whitespace-nowrap bg-white text-[hsl(258_30%_8%)] text-[11px] font-semibold rounded-full px-2 py-0.5 shadow">
                          {fmtCompact(r.total)} · {label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="hero-chip rounded-2xl px-3 py-2.5 min-w-0">
                <p className="text-[11px] opacity-70">In · {periodShort}</p>
                <p className="text-base font-semibold tabular-nums truncate">{mask(fmtCompact(income))}</p>
              </div>
              <div className="hero-chip rounded-2xl px-3 py-2.5 min-w-0">
                <p className="text-[11px] opacity-70">Out · {periodShort}</p>
                <p className="text-base font-semibold tabular-nums truncate">{mask(fmtCompact(expenses))}</p>
              </div>
              <div className="hero-chip-dark rounded-2xl px-3 py-2.5 min-w-0">
                <p className="text-[11px] opacity-70">{savings.kind === 'overspent' ? 'Over' : 'Saved'}</p>
                <p className="text-base font-semibold tabular-nums truncate">
                  {hidden ? '••' : savings.kind === 'saved' ? `${savings.rate}%` : savings.kind === 'overspent' ? fmtCompact(savings.amount) : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 mt-5 pb-8">
        {checklistVisible && <GettingStartedCard steps={steps} onStep={runStep} onDismiss={dismissChecklist} />}

        {/* ── ACCOUNTS ── Orbix tiles, two across */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-[0.16em]">Accounts · <span className="text-foreground">{accounts.length}</span></h2>
            <button onClick={() => navigate('/accounts')} className="tap-area text-sm text-foreground">See all</button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {accounts.map(a => {
              const utilization = Math.round(creditUtilization(a) ?? 0);
              return (
                <div key={a.id} className="group relative bg-card rounded-3xl p-4 min-w-0">
                  <button type="button" onClick={() => { setEditAccount(a); setShowAddAccount(true); }} aria-label={`Edit ${a.name}`} className="absolute inset-0 rounded-3xl" />
                  <IconTile value={a.icon} />
                  <p className="mt-4 text-xs text-muted-foreground truncate">
                    {a.type === 'credit' ? `Owed · ${a.name}` : a.name}
                  </p>
                  <p className={`mt-0.5 text-xl font-medium tabular-nums tracking-tight truncate ${a.type === 'credit' ? 'text-expense' : ''}`}>
                    {hidden ? '••••' : <BigAmount text={fmt(a.balance)} />}
                  </p>
                  {a.type === 'credit' && a.creditLimit != null && !hidden && (
                    <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(utilization, 100)}%` }} />
                    </div>
                  )}
                  <button onClick={() => setDeleteAccountId(a.id)} aria-label={`Delete ${a.name}`} className="hidden md:inline-flex absolute top-3 right-3 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-2">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            <button onClick={() => { setEditAccount(null); setShowAddAccount(true); }}
              className="rounded-3xl border border-dashed border-border p-4 min-h-[128px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Plus size={20} />
              <span className="text-xs">Add account</span>
            </button>
          </div>
        </div>


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

        {/* ── SPENDING ── */}
        <div className={SECTION}>
          {categorySpending.length > 0 && (
            <Card className={HALF}>
              <h2 className="font-heading text-sm mb-3">Breakdown</h2>
              <Suspense fallback={<ChartSkeleton height="aspect-square max-w-[180px]" />}>
                <SpendingPieChart data={categorySpending.map(([cat, data]) => ({ name: cat, value: data.total, icon: data.icon }))} />
              </Suspense>
            </Card>
          )}

          {transactions.length > 0 && (
            <Card className={HALF}>
              <h2 className="font-heading text-sm mb-3">Monthly trends</h2>
              <Suspense fallback={<ChartSkeleton />}>
                <MonthlyTrendChart transactions={transactions} creditAccountIds={creditAccountIds} />
              </Suspense>
            </Card>
          )}

          {categorySpending.length > 0 && (
            <Card className={HALF}>
              <h2 className="font-heading text-sm mb-3">By category</h2>
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

          <div className={HALF_SLOT}>
            <ExpenseByAccountTypeWidget accounts={accounts} transactions={filtered} hidden={hidden} mask={mask} />
          </div>

          <div className={FULL_SLOT}>
            <MonthlyComparisonWidget accounts={accounts} transactions={transactions} hidden={hidden} mask={mask} />
          </div>
        </div>

        {/* ── PLANNING ── */}
        <div className={SECTION}>
          <Card className={HALF}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading text-sm">Budgets</h2>
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

          <div className={HALF_SLOT}>
            <CreditUtilizationWidget accounts={accounts} hidden={hidden} mask={mask} />
          </div>

          <div className={HALF_SLOT}>
            <UpcomingBillsWidget accounts={accounts} transactions={transactions} />
          </div>

          {installmentSummary.count > 0 && (
            <Card className={HALF}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-sm">Installments</h2>
                <button onClick={() => navigate('/installments')} className="tap-area text-xs text-primary font-medium flex items-center gap-0.5">View all <ChevronRight size={14} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-primary">{installmentSummary.count}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
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

          <div className={FULL_SLOT}>
            <RecurringTracker />
          </div>
        </div>

        {/* ── INSIGHTS ── */}
        <div className={SECTION}>
          <div className={HALF_SLOT}>
            <SpendingForecastWidget transactions={transactions} />
          </div>

          {recentTx.length > 0 && (
            <Card className={FULL}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-sm">Recent</h2>
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
