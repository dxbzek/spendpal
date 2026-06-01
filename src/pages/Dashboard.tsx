import { useState, useMemo, lazy, Suspense } from 'react';
import { useBalanceMask, dispatchBalanceMaskToggle } from '@/hooks/useBalanceMask';
import { getCategoryChartColor, extractEmoji } from '@/utils/categoryColors';
import { activeBudgets } from '@/utils/budgets';
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
import { Eye, EyeOff, Plus, ChevronRight, Trash2, Edit2, Search, Wallet, Receipt, Target, PiggyBank, CheckCircle2, ArrowUpRight, ArrowDown } from 'lucide-react';
import logo from '@/assets/logo.png';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { useBudgetAlerts } from '@/hooks/useBudgetAlerts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCountUp } from '@/hooks/useCountUp';
import AddAccountDialog from '@/components/forms/AddAccountDialog';
// Charts pull in ~400 kB of recharts+d3. Defer them so the first Dashboard
// paint doesn't block on that graph code.
const SpendingPieChart = lazy(() => import('@/components/charts/SpendingPieChart'));
const MonthlyTrendChart = lazy(() => import('@/components/charts/MonthlyTrendChart'));
import type { Account } from '@/types/finance';

const ChartSkeleton = ({ height = 'h-[220px]' }: { height?: string }) => (
  <div className={`${height} w-full rounded-xl bg-muted/30 animate-pulse`} />
);
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';


// Hoisted out of the component so it's a stable type — defining it inline in
// render made React remount every card (and re-run their effects) each render.
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-card rounded-2xl p-4 card-shadow transition-shadow duration-200 hover:card-shadow-hover ${className}`}>{children}</div>
);

// Small progress ring used on the "Safe to spend today" hero card.
const SafeRing = ({ pct }: { pct: number }) => {
  const size = 62, stroke = 6;
  const r = (size - stroke) / 2 - 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= 75 ? 'hsl(var(--income))' : clamped >= 50 ? 'hsl(var(--warning))' : 'hsl(var(--expense))';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circ} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.7s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-heading font-bold" style={{ fontSize: size * 0.26, color }}>
        {Math.round(clamped)}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { accounts, transactions, budgets, goals, removeAccount, loading: dataLoading } = useFinance();
  
  const { fmt, fmtSigned, currency: userCurrency, fmtSecondary, secondaryCurrency, setSecondaryCurrency } = useCurrency();
  const isMobile = useIsMobile();
  const [secSearch, setSecSearch] = useState('');
  const filteredSecCurrencies = secSearch
    ? WORLD_CURRENCIES.filter(c => c.code.toLowerCase().includes(secSearch.toLowerCase()) || c.label.toLowerCase().includes(secSearch.toLowerCase()))
    : WORLD_CURRENCIES;
  const navigate = useNavigate();
  // Shared hook keeps the balance mask in sync across the app.
  const { hidden, mask } = useBalanceMask();
  const toggleHidden = () => dispatchBalanceMaskToggle(!hidden);
  const [period, setPeriod] = useState<'month' | 'year' | 'all'>('all');
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  useBudgetAlerts(budgets);

  const totalBalance = useMemo(() => accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0), [accounts]);
  const animatedBalance = useCountUp(totalBalance, 700);
  const sec = (n: number) => { const s = fmtSecondary(n); return s && !hidden ? s : null; };
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    const month = now.getMonth();
    const year = now.getFullYear();
    return transactions.filter(tx => {
      const d = parseISO(tx.date);
      if (d > now) return false; // skip future-dated transactions — not spent/earned yet
      if (period === 'all') return true;
      if (period === 'month') return d.getMonth() === month && d.getFullYear() === year;
      return d.getFullYear() === year;
    });
  }, [transactions, period, now]);

  const creditAccountIds = useMemo(() => new Set(accounts.filter(a => a.type === 'credit').map(a => a.id)), [accounts]);
  const income = useMemo(() => filtered.filter(t => t.type === 'income' && t.category !== 'Transfer' && !creditAccountIds.has(t.accountId)).reduce((s, t) => s + t.amount, 0), [filtered, creditAccountIds]);
  const expenses = useMemo(() => filtered.filter(t => t.type === 'expense' && t.category !== 'Transfer' && !t.isTrackingOnly).reduce((s, t) => s + t.amount, 0), [filtered]);
  const animatedIncome = useCountUp(income, 700);
  const animatedExpenses = useCountUp(expenses, 700);

  const categorySpending = useMemo(() => {
    const map: Record<string, { icon: string; total: number }> = {};
    filtered.filter(t => t.type === 'expense' && t.category !== 'Transfer' && !t.isTrackingOnly).forEach(t => {
      if (!map[t.category]) map[t.category] = { icon: t.categoryIcon, total: 0 };
      map[t.category].total += t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const [thisMonthIncome, thisMonthExpenses] = useMemo(() => {
    const month = now.getMonth(), year = now.getFullYear();
    let inc = 0, exp = 0;
    for (const tx of transactions) {
      const d = parseISO(tx.date);
      if (d.getMonth() !== month || d.getFullYear() !== year) continue;
      if (d > now) continue; // skip future-dated transactions — not spent/earned yet
      if (tx.type === 'income' && tx.category !== 'Transfer' && !creditAccountIds.has(tx.accountId)) inc += tx.amount;
      else if (tx.type === 'expense' && tx.category !== 'Transfer' && !tx.isTrackingOnly) exp += tx.amount;
    }
    return [inc, exp];
  }, [transactions, now, creditAccountIds]);
  const savingsRate = thisMonthIncome > 0 ? Math.round(((thisMonthIncome - thisMonthExpenses) / thisMonthIncome) * 100) : null;
  // Note: the financial-health score now lives solely on the AI Advisor page,
  // where it is actually computed — per the SpendPal design handoff.

  // Budgets that apply to the current month (carried forward if none created
  // yet), so the Safe-to-spend hero and status line reflect one consistent month.
  const activeBudgetsList = useMemo(
    () => activeBudgets(budgets, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`),
    [budgets, now]
  );
  const totalBudgeted = activeBudgetsList.reduce((s, b) => s + b.amount, 0);
  const totalSpent = activeBudgetsList.reduce((s, b) => s + b.spent, 0);
  const budgetPct = totalBudgeted ? Math.round((totalSpent / totalBudgeted) * 100) : 0;
  const creditCards = accounts.filter(a => a.type === 'credit' && a.dueDate);

  // ── Safe-to-spend (the flagship "understandable in one glance" hero) ──
  // Envelope is the user's monthly budget; if none is set, fall back to this
  // month's income so the card stays meaningful for budget-free users.
  const monthlyBudget = totalBudgeted > 0 ? totalBudgeted : thisMonthIncome;
  const leftThisMonth = monthlyBudget - thisMonthExpenses;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - now.getDate() + 1);
  const safeToday = Math.max(0, leftThisMonth / daysLeft);
  const todayKey = format(now, 'yyyy-MM-dd');
  const spentToday = useMemo(() => transactions
    .filter(t => t.type === 'expense' && t.category !== 'Transfer' && !t.isTrackingOnly && t.date.slice(0, 10) === todayKey)
    .reduce((s, t) => s + t.amount, 0), [transactions, todayKey]);
  const safeLeft = Math.max(0, safeToday - spentToday);
  const todayPct = safeToday > 0 ? Math.min(100, Math.round((spentToday / safeToday) * 100)) : 0;
  const animatedSafe = useCountUp(safeLeft, 700);
  const showSafeCard = monthlyBudget > 0;

  // Plain-language status sentence shown in the header band.
  const overBudget = totalBudgeted > 0 && leftThisMonth < 0;
  const budgetPart = totalBudgeted > 0
    ? (overBudget ? `${fmt(-leftThisMonth)} over budget` : `${fmt(leftThisMonth)} left of budget`)
    : null;
  const statusLine = savingsRate !== null && budgetPart
    ? `Saving ${savingsRate}% · ${budgetPart}`
    : savingsRate !== null
      ? `Saving ${savingsRate}% this month`
      : budgetPart;

  // Installment plan summary for Planning widget
  const installmentSummary = useMemo(() => {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const installmentTxs = transactions.filter(tx => tx.totalInstallments != null && tx.currentInstallment != null);
    const map: Record<string, typeof installmentTxs> = {};
    installmentTxs.forEach(tx => {
      const key = `${tx.merchant}|${tx.totalInstallments}`;
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });
    const plans = Object.values(map).map(txs => {
      const latest = [...txs].sort((a, b) => b.date.localeCompare(a.date))[0];
      const paid = latest.currentInstallment ?? txs.length;
      const total = latest.totalInstallments!;
      const monthly = latest.amount;
      const remaining = Math.max(0, total - paid);
      return { paid, total, monthly, remaining, merchant: latest.merchant };
    });
    const active = plans.filter(p => p.paid < p.total);
    return {
      count: active.length,
      monthlyTotal: round2(active.reduce((s, p) => s + p.monthly, 0)),
      totalRemaining: round2(active.reduce((s, p) => s + p.remaining * p.monthly, 0)),
    };
  }, [transactions]);

  // Merge transfer pairs for recent transactions display (same logic as Transactions page)
  const recentTx = useMemo(() => {
    const pairedIds = new Set<string>();
    const mergedList: (typeof transactions[0] & { toAccountId?: string })[] = [];
    const transferExpenses = transactions.filter(t => t.category === 'Transfer' && t.type === 'expense');
    const transferIncomes = transactions.filter(t => t.category === 'Transfer' && t.type === 'income');
    const transferToAccount = new Map<string, string>();
    for (const exp of transferExpenses) {
      const match = transferIncomes.find(inc => inc.date === exp.date && inc.amount === exp.amount && !pairedIds.has(inc.id));
      if (match) {
        pairedIds.add(exp.id);
        pairedIds.add(match.id);
        transferToAccount.set(exp.id, match.accountId);
      }
    }
    for (const tx of transactions) {
      if (pairedIds.has(tx.id) && !transferToAccount.has(tx.id)) continue; // skip income half
      mergedList.push({ ...tx, toAccountId: transferToAccount.get(tx.id) });
    }
    return mergedList.slice(0, 5);
  }, [transactions]);


  // Skeleton keeps the layout stable while data loads.
  if (dataLoading) {
    return (
      <div>
        <div className="gradient-primary px-5 md:px-8 pt-12 pb-8 rounded-b-3xl">
          <Skeleton className="h-6 w-40 bg-primary-foreground/20 mb-4" />
          <Skeleton className="h-10 w-48 bg-primary-foreground/20 mb-2" />
          <Skeleton className="h-4 w-28 bg-primary-foreground/20" />
        </div>
        <div className="px-5 md:px-8 mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
          <Skeleton className="col-span-2 lg:col-span-4 h-48 rounded-2xl" />
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i + 4} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // First-run onboarding when the user has no accounts yet.
  if (!dataLoading && accounts.length === 0) {
    const steps = [
      { icon: Wallet, label: 'Add your first account', hint: 'Cash, bank, or credit card', done: accounts.length > 0 },
      { icon: Receipt, label: 'Record a transaction', hint: 'Income or expense', done: transactions.length > 0 },
      { icon: PiggyBank, label: 'Create a budget', hint: 'Track spending by category', done: budgets.length > 0 },
      { icon: Target, label: 'Set a savings goal', hint: 'Something to work toward', done: goals.length > 0 },
    ];
    return (
      <div className="px-5 md:px-8 pt-12 pb-8 max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Wallet size={36} className="text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-heading mb-2">Welcome to SpendPal!</h1>
          <p className="text-muted-foreground text-sm">Get started in a few simple steps to take control of your finances.</p>
        </div>

        <div className="space-y-3 mb-8">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className={`flex items-center gap-4 p-4 rounded-2xl card-shadow transition-all ${step.done ? 'bg-income/5 border border-income/20' : 'bg-card'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${step.done ? 'bg-income/15' : 'bg-accent'}`}>
                  {step.done
                    ? <CheckCircle2 size={20} className="text-income" />
                    : <Icon size={18} className="text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${step.done ? 'line-through text-muted-foreground' : ''}`}>{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.hint}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${step.done ? 'bg-income/15 text-income' : 'bg-muted text-muted-foreground'}`}>
                  {step.done ? 'Done' : `Step ${i + 1}`}
                </span>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setShowAddAccount(true)}
          className="w-full h-14 gradient-primary text-primary-foreground rounded-2xl font-semibold text-base flex items-center justify-center gap-2 shadow-fab active:scale-95 transition-transform"
        >
          <Plus size={20} />
          Add Your First Account
        </button>

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
      <div className={`gradient-primary px-5 md:px-8 ${isMobile ? 'pt-12 pb-8 rounded-b-3xl' : 'pt-8 pb-6'}`}>
        <div className={`${isMobile ? '' : 'max-w-5xl mx-auto'}`}>
          <div className={`flex items-center justify-between ${isMobile ? 'mb-6' : 'mb-4'}`}>
            <div className="flex items-center gap-3 min-w-0">
              <img src={logo} alt="" className="w-9 h-9 rounded-full object-contain bg-primary-foreground/20 p-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-base font-heading font-bold text-primary-foreground leading-tight">Overview</p>
                <p className="text-[11.5px] text-primary-foreground/70 mt-0.5">Financial overview</p>
              </div>
            </div>
            <button onClick={toggleHidden} className="text-primary-foreground/80 p-2 -mr-2 rounded-lg" role="switch" aria-checked={hidden} aria-label={hidden ? 'Show balance' : 'Hide balance'}>
              {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-primary-foreground/70 text-xs uppercase tracking-wider mb-1">Total Balance</p>
              <p className="text-financial-hero text-primary-foreground">{hidden ? '••••••' : fmt(animatedBalance)}</p>
              {sec(totalBalance) && <p className="text-sm text-primary-foreground/60 mt-0.5">≈ {sec(totalBalance)}</p>}
            </div>

            {/* Secondary currency */}
            <Select value={secondaryCurrency || '__none__'} onValueChange={v => setSecondaryCurrency(v === '__none__' ? null : v)}>
              <SelectTrigger className="h-7 shrink-0 w-auto min-w-[78px] max-w-[110px] sm:max-w-[140px] bg-primary-foreground/10 border-0 text-primary-foreground/70 text-[11px] rounded-full px-3 gap-1">
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
          </div>

          {statusLine && (
            <div className="mt-3.5 inline-flex bg-primary-foreground/15 backdrop-blur-sm rounded-xl px-3 py-2 text-[12.5px] leading-snug text-primary-foreground">
              {statusLine}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 md:px-8 -mt-4 pb-8">
        {/* Safe to spend today — the flagship "at a glance" hero */}
        {showSafeCard && (
          <Card className="border border-primary/20 mb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-muted-foreground mb-1">Safe to spend today</p>
                <p className="text-financial-large text-primary tabular-nums">{hidden ? '••••••' : fmt(animatedSafe)}</p>
              </div>
              <SafeRing pct={Math.max(0, 100 - todayPct)} />
            </div>
            <div className="mt-2.5 h-[7px] bg-muted rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${todayPct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full rounded-full bg-primary" />
            </div>
            <p className="flex items-center justify-between text-[11.5px] text-muted-foreground mt-2.5">
              <span className="truncate">{hidden ? '••••' : fmt(spentToday)} spent of {hidden ? '••••' : fmt(safeToday)} daily allowance</span>
              <span className="font-semibold text-foreground shrink-0 ml-2">{daysLeft}d left</span>
            </p>
          </Card>
        )}

        {/* Alerts */}
        <div className="mb-4">
          <RecurringDueBanner transactions={transactions} />
        </div>

        {/* Section divider helper */}
        {/* ── OVERVIEW ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-3 pt-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Overview</span>
            <div className="flex-1 h-px bg-border" />
            <div className="flex gap-0.5 p-0.5 bg-muted rounded-lg shrink-0">
              {(['all', 'month', 'year'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
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
            {sec(income) && <p className="text-[11px] text-muted-foreground truncate">≈ {sec(income)}</p>}
          </Card>
          <Card className="col-span-1 overflow-hidden">
            <div className="w-[26px] h-[26px] rounded-lg bg-expense/[0.12] text-expense flex items-center justify-center mb-2"><ArrowDown size={15} /></div>
            <p className="text-xs text-muted-foreground mb-1">Expenses</p>
            <p className="text-financial-medium text-expense tabular-nums">{mask(fmt(animatedExpenses))}</p>
            {sec(expenses) && <p className="text-[11px] text-muted-foreground truncate">≈ {sec(expenses)}</p>}
          </Card>

          {savingsRate !== null && (
            <Card className="col-span-2 lg:col-span-4 border-t-2 border-t-primary">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Savings Rate — This Month</p>
                  <p className={`text-financial-medium ${savingsRate >= 20 ? 'text-income' : savingsRate >= 0 ? 'text-warning' : 'text-expense'}`}>
                    {hidden ? '••' : `${savingsRate}%`}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Saved: {mask(fmt(thisMonthIncome - thisMonthExpenses))}</p>
                  <p className="text-[11px]">{savingsRate >= 20 ? 'On track' : savingsRate < 0 ? 'Overspending' : 'Room to save'}</p>
                </div>
              </div>
              {!hidden && (
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${savingsRate >= 20 ? 'bg-income' : savingsRate >= 0 ? 'bg-warning' : 'bg-expense'}`}
                    style={{ width: `${Math.max(0, Math.min(savingsRate, 100))}%` }}
                  />
                </div>
              )}
            </Card>
          )}
        </div>

        {/* ── ACCOUNTS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mt-6">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Accounts</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Card className="col-span-2 lg:col-span-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-sm">Accounts</h2>
              <button onClick={() => { setEditAccount(null); setShowAddAccount(true); }} className="text-xs text-primary font-medium flex items-center gap-1">
                <Plus size={14} /> Add
              </button>
            </div>
            <div className="space-y-4">
              {(['cash', 'debit', 'credit'] as const).map(accountType => {
                const group = accounts.filter(a => a.type === accountType);
                if (group.length === 0) return null;
                const labels = { cash: '💵 Cash', debit: '💳 Debit Cards', credit: '🏦 Credit Cards' };
                return (
                  <div key={accountType}>
                    <p className="text-xs font-medium text-muted-foreground mb-2">{labels[accountType]}</p>
                    <div className="space-y-3">
                      {group.map(a => {
                        const spent = a.type === 'credit' && a.creditLimit ? a.creditLimit - a.balance : 0;
                        const utilization = a.type === 'credit' && a.creditLimit ? Math.min(Math.round((spent / a.creditLimit) * 100), 100) : 0;
                        const utilizationColor = utilization > 75 ? 'bg-expense' : utilization > 50 ? 'bg-warning' : 'bg-primary';
                        return (
                          <div key={a.id} className="group">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-2xl shrink-0">{a.icon}</span>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{a.name}</p>
                                  {a.type === 'credit' && (
                                    <div className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                                      {a.statementDate && a.statementDate > 0 && <span>Stmt: {a.statementDate}th</span>}
                                      {a.dueDate && <span>Due: {a.dueDate}th</span>}
                                      {a.creditLimit && <span>Limit: {fmt(a.creditLimit)}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <div className="text-right">
                                  <p className="font-heading text-sm">{mask(fmt(a.balance))}</p>
                                  {sec(a.balance) && <p className="text-[10px] text-muted-foreground">≈ {sec(a.balance)}</p>}
                                  {a.type === 'credit' && (
                                    <p className="text-[11px] font-medium text-primary/70">Available Limit</p>
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
                            {a.type === 'credit' && a.creditLimit && (
                              <div className="mt-1.5 ml-11">
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mt-6">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Spending</span>
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
                  const pct = expenses ? Math.round((data.total / expenses) * 100) : 0;
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
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full rounded-full" style={{ backgroundColor: barColor }} />
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mt-6">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Planning</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Card className="col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading text-sm">Budget Overview</h2>
              <button onClick={() => navigate('/budgets')} className="text-xs text-primary font-medium flex items-center gap-0.5">View all <ChevronRight size={14} /></button>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{budgetPct}% spent</span><span>{fmt(totalSpent)} / {fmt(totalBudgeted)}</span>
            </div>
            <div className="h-4 bg-muted rounded-full overflow-hidden mb-3">
              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(budgetPct, 100)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
                className={`h-full rounded-full ${budgetPct > 90 ? 'bg-expense' : 'bg-primary'}`} />
            </div>
            {budgets.filter(b => b.amount > 0).sort((a, b) => (b.spent / b.amount) - (a.spent / a.amount)).slice(0, 3).map(b => {
              const pct = Math.min(Math.round((b.spent / b.amount) * 100), 100);
              return (
                <div key={b.id} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between text-xs mb-0.5 gap-2">
                    <span className="text-muted-foreground truncate min-w-0" title={b.category}>{b.category}</span>
                    <span className={`font-medium shrink-0 ${pct >= 100 ? 'text-expense' : pct > 75 ? 'text-warning' : 'text-muted-foreground'}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }}
                      className={`h-full rounded-full ${pct >= 100 ? 'bg-expense' : pct > 75 ? 'bg-warning' : 'bg-primary'}`} />
                  </div>
                </div>
              );
            })}
          </Card>

          <div className="col-span-2 lg:col-span-2">
            <CreditUtilizationWidget accounts={accounts} hidden={hidden} mask={mask} />
          </div>

          {creditCards.length > 0 && (
            <Card className="col-span-2 lg:col-span-2">
              <h2 className="font-heading text-sm mb-3">Credit Card Due Dates</h2>
              <div className="space-y-2">
                {creditCards.map(cc => {
                  const dueDay = cc.dueDate!;
                  const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
                  if (dueDate < now) dueDate.setMonth(dueDate.getMonth() + 1);
                  const daysLeft = differenceInDays(dueDate, now);
                  return (
                    <div key={cc.id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2"><span className="text-lg">{cc.icon}</span><span className="text-sm">{cc.name}</span></div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Due {format(dueDate, 'MMM d')}</p>
                        <p className={`text-xs font-medium ${daysLeft <= 7 ? 'text-expense' : 'text-primary'}`}>{daysLeft}d left</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <div className="col-span-2 lg:col-span-2">
            <UpcomingBillsWidget accounts={accounts} transactions={transactions} />
          </div>

          {installmentSummary.count > 0 && (
            <Card className="col-span-2 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-sm">Installment Plans</h2>
                <button onClick={() => navigate('/installments')} className="text-xs text-primary font-medium flex items-center gap-0.5">View all <ChevronRight size={14} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-primary">{installmentSummary.count}</p>
                  <p className="text-[11px] text-muted-foreground">Active plans</p>
                </div>
                <div>
                  <p className="text-sm font-bold">{mask(fmt(installmentSummary.monthlyTotal))}</p>
                  <p className="text-[11px] text-muted-foreground">Monthly</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-expense">{mask(fmt(installmentSummary.totalRemaining))}</p>
                  <p className="text-[11px] text-muted-foreground">Total left</p>
                </div>
              </div>
            </Card>
          )}

          <div className="col-span-2 lg:col-span-4">
            <RecurringTracker />
          </div>
        </div>

        {/* ── INSIGHTS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mt-6">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Insights</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="col-span-2 lg:col-span-2">
            <SpendingForecastWidget transactions={transactions} />
          </div>

          {recentTx.length > 0 && (
            <Card className="col-span-2 lg:col-span-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-sm">Recent Transactions</h2>
                <button onClick={() => navigate('/transactions')} className="text-xs text-primary font-medium flex items-center gap-0.5">View all <ChevronRight size={14} /></button>
              </div>
              <div className="space-y-3">
                {recentTx.map(tx => {
                  const isTransfer = tx.category === 'Transfer';
                  const toAccName = tx.toAccountId ? (accounts.find(a => a.id === tx.toAccountId)?.name || '') : null;
                  const fromAccName = isTransfer ? (accounts.find(a => a.id === tx.accountId)?.name || '') : null;
                  return (
                    <div key={tx.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{extractEmoji(tx.categoryIcon)}</span>
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
