import { useState, useMemo } from 'react';
import { dispatchBalanceMaskToggle } from '@/hooks/useBalanceMask';
import { CATEGORY_CHART_COLORS, extractEmoji } from '@/utils/categoryColors';
import RecurringTracker from '@/components/dashboard/RecurringTracker';
import RecurringDueBanner from '@/components/dashboard/RecurringDueBanner';
import NetWorthWidget from '@/components/dashboard/NetWorthWidget';
import MoneySavedWidget from '@/components/dashboard/MoneySavedWidget';
import UpcomingBillsWidget from '@/components/dashboard/UpcomingBillsWidget';
import SpendingForecastWidget from '@/components/dashboard/SpendingForecastWidget';
import CreditUtilizationWidget from '@/components/dashboard/CreditUtilizationWidget';
import ExpenseByAccountTypeWidget from '@/components/dashboard/ExpenseByAccountTypeWidget';
import MonthlyComparisonWidget from '@/components/dashboard/MonthlyComparisonWidget';
import { useFinance } from '@/context/FinanceContext';

import { useCurrency } from '@/context/CurrencyContext';
import { WORLD_CURRENCIES } from '@/utils/currencies';
import { Eye, EyeOff, Plus, ChevronRight, Loader2, Trash2, Edit2, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays, parseISO, addMonths } from 'date-fns';
import { motion } from 'framer-motion';
import { useBudgetAlerts } from '@/hooks/useBudgetAlerts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCountUp } from '@/hooks/useCountUp';
import AddAccountDialog from '@/components/forms/AddAccountDialog';
import SpendingPieChart from '@/components/charts/SpendingPieChart';
import MonthlyTrendChart from '@/components/charts/MonthlyTrendChart';
import type { Account } from '@/types/finance';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';


const Dashboard = () => {
  const { accounts, transactions, budgets, goals, removeAccount, loading: dataLoading } = useFinance();
  
  const { fmt, fmtSigned, currency: userCurrency, fmtSecondary, secondaryCurrency, setSecondaryCurrency } = useCurrency();
  const isMobile = useIsMobile();
  const [secSearch, setSecSearch] = useState('');
  const filteredSecCurrencies = secSearch
    ? WORLD_CURRENCIES.filter(c => c.code.toLowerCase().includes(secSearch.toLowerCase()) || c.label.toLowerCase().includes(secSearch.toLowerCase()))
    : WORLD_CURRENCIES;
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => localStorage.getItem('balanceHidden') === 'true');

  const toggleHidden = () => {
    setHidden(prev => {
      const next = !prev;
      dispatchBalanceMaskToggle(next);
      return next;
    });
  };
  const [period, setPeriod] = useState<'month' | 'year' | 'all'>('all');
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  useBudgetAlerts(budgets);

  const totalBalance = useMemo(() => accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0), [accounts]);
  const mask = (val: string) => hidden ? '••••••' : val;
  const animatedBalance = useCountUp(totalBalance, 700);
  const sec = (n: number) => { const s = fmtSecondary(n); return s && !hidden ? s : null; };
  // Stable within session — the date object is computed once on mount.
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    if (period === 'all') return transactions;
    const month = now.getMonth();
    const year = now.getFullYear();
    return transactions.filter(tx => {
      const d = parseISO(tx.date);
      if (period === 'month') return d.getMonth() === month && d.getFullYear() === year;
      return d.getFullYear() === year;
    });
  }, [transactions, period, now]);

  const creditAccountIds = useMemo(() => new Set(accounts.filter(a => a.type === 'credit').map(a => a.id)), [accounts]);
  const income = useMemo(() => filtered.filter(t => t.type === 'income' && t.category !== 'Transfer' && !creditAccountIds.has(t.accountId)).reduce((s, t) => s + t.amount, 0), [filtered, creditAccountIds]);
  const expenses = useMemo(() => filtered.filter(t => t.type === 'expense' && t.category !== 'Transfer').reduce((s, t) => s + t.amount, 0), [filtered]);

  const categorySpending = useMemo(() => {
    const map: Record<string, { icon: string; total: number }> = {};
    filtered.filter(t => t.type === 'expense' && t.category !== 'Transfer').forEach(t => {
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
      if (tx.type === 'income' && tx.category !== 'Transfer' && !creditAccountIds.has(tx.accountId)) inc += tx.amount;
      else if (tx.type === 'expense' && tx.category !== 'Transfer') exp += tx.amount;
    }
    return [inc, exp];
  }, [transactions, now, creditAccountIds]);
  const savingsRate = thisMonthIncome > 0 ? Math.round(((thisMonthIncome - thisMonthExpenses) / thisMonthIncome) * 100) : null;

  const healthScore = useMemo(() => {
    const hasActivity = thisMonthIncome > 0 || thisMonthExpenses > 0;
    // Need at least some financial activity to produce a meaningful score
    if (!hasActivity && budgets.length === 0) return null;

    // Savings rate (0-30): only score if there is actual income this month
    const sr = savingsRate ?? null;
    const savingsScore = sr === null ? 0 : sr >= 20 ? 30 : sr >= 10 ? 20 : sr >= 0 ? 10 : 0;

    // Budget adherence (0-30): only score if budgets exist
    const budgetScore = budgets.length === 0 ? 0 : Math.round(
      (budgets.filter(b => b.spent <= b.amount).length / budgets.length) * 30
    );

    // Debt / credit utilization (0-20)
    const creditAccs = accounts.filter(a => a.type === 'credit' && a.creditLimit);
    const avgUtil = creditAccs.length
      ? creditAccs.reduce((s, a) => s + ((a.creditLimit! - a.balance) / a.creditLimit!), 0) / creditAccs.length
      : 0;
    // No credit cards = neutral 10 (only when there IS other activity to score)
    const debtScore = creditAccs.length === 0 ? 10 : avgUtil < 0.3 ? 20 : avgUtil < 0.5 ? 14 : avgUtil < 0.75 ? 8 : 3;

    // Net worth positive (0-20)
    const nwScore = totalBalance > 0 ? Math.min(20, Math.round((totalBalance / Math.max(thisMonthExpenses || 1, 1)) * 2)) : 0;

    return Math.min(100, savingsScore + budgetScore + debtScore + nwScore);
  }, [savingsRate, thisMonthIncome, thisMonthExpenses, budgets, accounts, totalBalance]);

  const totalBudgeted = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const budgetPct = totalBudgeted ? Math.round((totalSpent / totalBudgeted) * 100) : 0;
  const creditCards = accounts.filter(a => a.type === 'credit' && a.dueDate);

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

  const recurring = useMemo(() => transactions.filter(t => t.isRecurring), [transactions]);
  const _recurringTotal = recurring.reduce((s, t) => s + t.amount, 0);
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

  const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`bg-card rounded-2xl p-4 card-shadow transition-shadow duration-200 hover:card-shadow-hover ${className}`}>{children}</div>
  );


  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className={`gradient-primary px-5 md:px-8 ${isMobile ? 'pt-12 pb-8 rounded-b-3xl' : 'pt-8 pb-6'}`}>
        <div className={`${isMobile ? '' : 'max-w-5xl mx-auto'}`}>
          <div className={`flex items-center ${isMobile ? 'justify-between mb-6' : 'justify-between mb-4'}`}>
            <h1 className="text-xl text-primary-foreground font-heading">Financial Overview</h1>
            <button onClick={toggleHidden} className="text-primary-foreground/80 p-2 -mr-2 rounded-lg" role="switch" aria-checked={hidden} aria-label={hidden ? 'Show balance' : 'Hide balance'}>
              {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className={`${isMobile ? 'text-center' : 'flex items-center justify-between gap-8'}`}>
            <div className={isMobile ? '' : 'text-left'}>
              <p className="text-primary-foreground/70 text-xs uppercase tracking-wider mb-1">Total Balance</p>
              <p className="text-financial-hero text-primary-foreground">{hidden ? '••••••' : fmt(animatedBalance)}</p>
              {sec(totalBalance) && <p className="text-sm text-primary-foreground/60 mt-0.5">≈ {sec(totalBalance)}</p>}
            </div>

            {/* Secondary currency + period selector */}
            <div className={`${isMobile ? 'flex flex-col items-center gap-3 mt-4' : 'flex flex-col items-end gap-3'}`}>
              <Select value={secondaryCurrency || '__none__'} onValueChange={v => setSecondaryCurrency(v === '__none__' ? null : v)}>
                <SelectTrigger className="h-7 w-auto min-w-[100px] max-w-[140px] bg-primary-foreground/10 border-0 text-primary-foreground/70 text-[11px] rounded-full px-3 gap-1">
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
              <div className="flex gap-0.5 p-0.5 bg-primary-foreground/10 rounded-lg">
                {(['all', 'month', 'year'] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-2.5 sm:px-4 py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all ${
                      period === p ? 'bg-primary-foreground/20 text-primary-foreground' : 'text-primary-foreground/60'
                    }`}>
                    {p === 'all' ? 'All' : p === 'month' ? 'Month' : 'Year'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 -mt-4 pb-8">
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
          </div>

          <div className="col-span-1">
            <NetWorthWidget accounts={accounts} hidden={hidden} mask={mask} />
          </div>
          <div className="col-span-1">
            <MoneySavedWidget transactions={transactions} creditAccountIds={creditAccountIds} hidden={hidden} mask={mask} />
          </div>
          <Card className="col-span-1 overflow-hidden">
            <p className="text-xs text-muted-foreground mb-1">Income</p>
            <p className="text-financial-medium">{mask(fmt(income))}</p>
            {sec(income) && <p className="text-[11px] text-muted-foreground truncate">≈ {sec(income)}</p>}
          </Card>
          <Card className="col-span-1 overflow-hidden">
            <p className="text-xs text-muted-foreground mb-1">Expenses</p>
            <p className="text-financial-medium">{mask(fmt(expenses))}</p>
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
                  <p className="text-[11px]">{savingsRate >= 20 ? '🎯 On track' : savingsRate >= 10 ? '📈 Getting there' : savingsRate < 0 ? '⚠️ Overspending' : '💡 Room to save'}</p>
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

        {/* ── ACCOUNTS & HEALTH ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mt-6">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Accounts & Health</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Card className="col-span-2 lg:col-span-3">
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
                        const utilizationColor = utilization > 75 ? 'bg-expense' : utilization > 50 ? 'bg-amber-500' : 'bg-primary';
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

          <Card className="col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-sm">Financial Health</h2>
              {healthScore !== null && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  healthScore >= 75 ? 'bg-income/10 text-income' : healthScore >= 50 ? 'bg-warning/10 text-warning' : 'bg-expense/10 text-expense'
                }`}>
                  {healthScore >= 75 ? 'Good' : healthScore >= 50 ? 'Fair' : 'Needs Work'}
                </span>
              )}
            </div>
            {healthScore === null ? (
              <p className="text-xs text-muted-foreground py-2">Add transactions, budgets, or accounts to see your score.</p>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-20 h-20 shrink-0">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                    <circle cx="40" cy="40" r="32" fill="none"
                      stroke={healthScore >= 75 ? 'hsl(var(--income))' : healthScore >= 50 ? 'hsl(var(--warning))' : 'hsl(var(--expense))'}
                      strokeWidth="6"
                      strokeDasharray={`${(healthScore / 100) * 201} 201`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-heading">{hidden ? '—' : healthScore}</span>
                  </div>
                </div>
                <div className="space-y-1.5 w-full text-xs">
                  {[
                    { label: 'Savings rate', val: savingsRate !== null ? `${savingsRate}%` : 'No data', ok: (savingsRate ?? -1) >= 10 },
                    { label: 'Budget adherence', val: budgets.length ? `${budgets.filter(b => b.spent <= b.amount).length}/${budgets.length} on track` : 'No budgets', ok: budgets.length === 0 || budgets.every(b => b.spent <= b.amount) },
                    { label: 'Credit utilization', val: accounts.some(a => a.type === 'credit') ? `${Math.round(accounts.filter(a => a.type === 'credit' && a.creditLimit).reduce((s, a) => s + ((a.creditLimit! - a.balance) / a.creditLimit!), 0) / Math.max(accounts.filter(a => a.type === 'credit' && a.creditLimit).length, 1) * 100)}%` : 'No credit', ok: true },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className={`font-medium ${item.ok ? 'text-income' : 'text-warning'}`}>{hidden ? '••' : item.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              <SpendingPieChart data={categorySpending.map(([cat, data]) => ({ name: cat, value: data.total, icon: data.icon }))} />
            </Card>
          )}

          {transactions.length > 0 && (
            <Card className="col-span-2 lg:col-span-2">
              <h2 className="font-heading text-sm mb-3">Monthly Trends</h2>
              <MonthlyTrendChart transactions={transactions} creditAccountIds={creditAccountIds} />
            </Card>
          )}

          {categorySpending.length > 0 && (
            <Card className="col-span-2 lg:col-span-2">
              <h2 className="font-heading text-sm mb-3">By Category</h2>
              <div className="space-y-2.5">
                {categorySpending.slice(0, 5).map(([cat, data], idx) => {
                  const pct = expenses ? Math.round((data.total / expenses) * 100) : 0;
                  const barColor = CATEGORY_CHART_COLORS[cat] || CATEGORY_CHART_COLORS._default(idx);
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: barColor }} /> {cat}</span>
                        <span className="text-sm font-medium">{fmt(data.total)}</span>
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
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-muted-foreground truncate max-w-[120px]">{b.category}</span>
                    <span className={`font-medium ${pct >= 100 ? 'text-expense' : pct > 75 ? 'text-warning' : 'text-muted-foreground'}`}>{pct}%</span>
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
