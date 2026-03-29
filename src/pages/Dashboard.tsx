import { useState, useMemo } from 'react';
import { CATEGORY_CHART_COLORS, extractEmoji } from '@/utils/categoryColors';
import RecurringTracker from '@/components/dashboard/RecurringTracker';
import BudgetAlertBanners from '@/components/dashboard/BudgetAlertBanners';
import NetWorthWidget from '@/components/dashboard/NetWorthWidget';
import MoneySavedWidget from '@/components/dashboard/MoneySavedWidget';
import UpcomingBillsWidget from '@/components/dashboard/UpcomingBillsWidget';
import MonthlyReportCard from '@/components/dashboard/MonthlyReportCard';
import CreditUtilizationWidget from '@/components/dashboard/CreditUtilizationWidget';
import ExpenseByAccountTypeWidget from '@/components/dashboard/ExpenseByAccountTypeWidget';
import MonthlyComparisonWidget from '@/components/dashboard/MonthlyComparisonWidget';
import { useFinance } from '@/context/FinanceContext';
import { useAuth } from '@/context/AuthContext';
import { useCurrency, WORLD_CURRENCIES } from '@/context/CurrencyContext';
import { Eye, EyeOff, Plus, ChevronRight, Sparkles, Loader2, Trash2, Edit2, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { useAI } from '@/hooks/useAI';
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
  const { signOut } = useAuth();
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
      localStorage.setItem('balanceHidden', String(next));
      return next;
    });
  };
  const [period, setPeriod] = useState<'month' | 'year' | 'all'>('all');
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const { loading: aiLoading, summaryText, generateSummary } = useAI();
  useBudgetAlerts(budgets);

  const mask = (val: string) => hidden ? '••••••' : val;
  const animatedBalance = useCountUp(totalBalance, 700);
  const sec = (n: number) => { const s = fmtSecondary(n); return s && !hidden ? s : null; };
  const totalBalance = useMemo(() => accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0), [accounts]);
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
  const income = useMemo(() => filtered.filter(t => t.type === 'income' && !creditAccountIds.has(t.accountId)).reduce((s, t) => s + t.amount, 0), [filtered, creditAccountIds]);
  const expenses = useMemo(() => filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [filtered]);

  const categorySpending = useMemo(() => {
    const map: Record<string, { icon: string; total: number }> = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
      if (!map[t.category]) map[t.category] = { icon: t.categoryIcon, total: 0 };
      map[t.category].total += t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const totalBudgeted = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const budgetPct = totalBudgeted ? Math.round((totalSpent / totalBudgeted) * 100) : 0;
  const creditCards = accounts.filter(a => a.type === 'credit' && a.dueDate);
  const recurring = useMemo(() => transactions.filter(t => t.isRecurring), [transactions]);
  const recurringTotal = recurring.reduce((s, t) => s + t.amount, 0);
  const recentTx = transactions.slice(0, 5);

  const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`bg-card rounded-2xl p-4 card-shadow transition-shadow duration-200 hover:card-shadow-hover ${className}`}>{children}</div>
  );

  const handleGenerateSummary = () => {
    generateSummary({
      income, expenses,
      categories: categorySpending.map(([cat, data]) => ({ category: cat, amount: data.total })),
      totalBalance,
      budgets: budgets.map(b => ({ category: b.category, budgeted: b.amount, spent: b.spent })),
      recurring: recurring.map(r => ({ merchant: r.merchant, amount: r.amount })),
    });
  };

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
            <button onClick={toggleHidden} className="text-primary-foreground/80 p-2 -mr-2 rounded-lg" aria-label={hidden ? 'Show balance' : 'Hide balance'} aria-pressed={hidden}>
              {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className={`${isMobile ? 'text-center' : 'flex items-center justify-between gap-8'}`}>
            <div className={isMobile ? '' : 'text-left'}>
              <p className="text-primary-foreground/70 text-xs uppercase tracking-wider mb-1">Total Balance</p>
              <p className="text-financial-hero text-primary-foreground">{hidden ? '••••••' : fmt(animatedBalance)}</p>
              {sec(totalBalance) && <p className="text-sm text-primary-foreground/60 mt-0.5">≈ {sec(totalBalance)}</p>}

              {/* Income / Expense summary strip */}
              <div className={`flex gap-6 mt-3 ${isMobile ? 'justify-center' : ''}`}>
                <div className={isMobile ? 'text-center' : 'text-left'}>
                  <p className="text-primary-foreground/50 text-[10px] uppercase tracking-wider">Income</p>
                  <p className="text-primary-foreground text-sm font-semibold">{mask(fmt(income))}</p>
                </div>
                <div className="w-px bg-primary-foreground/20" />
                <div className={isMobile ? 'text-center' : 'text-left'}>
                  <p className="text-primary-foreground/50 text-[10px] uppercase tracking-wider">Expenses</p>
                  <p className="text-primary-foreground text-sm font-semibold">{mask(fmt(expenses))}</p>
                </div>
              </div>
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
              <div className="flex gap-1 p-0.5 bg-primary-foreground/10 rounded-lg">
                {(['all', 'month', 'year'] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                      period === p ? 'bg-primary-foreground/20 text-primary-foreground' : 'text-primary-foreground/60'
                    }`}>
                    {p === 'all' ? 'All Time' : p === 'month' ? 'This Month' : 'This Year'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 -mt-4 space-y-4 pb-6">
        {/* Budget overspending alerts */}
        <BudgetAlertBanners budgets={budgets} />

        {/* Responsive grid wrapper for dashboard widgets */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">

        {/* Net Worth */}
        <div className="col-span-1">
          <NetWorthWidget accounts={accounts} hidden={hidden} mask={mask} />
        </div>
        {/* Money Saved */}
        <div className="col-span-1">
          <MoneySavedWidget transactions={transactions} creditAccountIds={creditAccountIds} hidden={hidden} mask={mask} />
        </div>

        {/* Income */}
        <Card className="col-span-1 border-t-2 border-t-income">
          <p className="text-xs text-muted-foreground mb-1">Income</p>
          <p className="text-financial-medium text-income">{mask(fmt(income))}</p>
          {sec(income) && <p className="text-[11px] text-muted-foreground">≈ {sec(income)}</p>}
        </Card>
        {/* Expenses */}
        <Card className="col-span-1 border-t-2 border-t-expense">
          <p className="text-xs text-muted-foreground mb-1">Expenses</p>
          <p className="text-financial-medium text-expense">{mask(fmt(expenses))}</p>
          {sec(expenses) && <p className="text-[11px] text-muted-foreground">≈ {sec(expenses)}</p>}
        </Card>

        {/* Accounts - spans full width */}
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
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{a.icon}</span>
                              <div>
                                <p className="text-sm font-medium">{a.name}</p>
                                {a.type === 'credit' && (
                                  <div className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                                    {a.statementDate && a.statementDate > 0 && <span>Stmt: {a.statementDate}th</span>}
                                    {a.dueDate && <span>Due: {a.dueDate}th</span>}
                                    {a.creditLimit && <span>Limit: {fmt(a.creditLimit)}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
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

        {/* Credit Utilization Tracker */}
        <div className="col-span-2 lg:col-span-2">
          <CreditUtilizationWidget accounts={accounts} hidden={hidden} mask={mask} />
        </div>

        {/* Expenses by Account Type */}
        <div className="col-span-2 lg:col-span-2">
          <ExpenseByAccountTypeWidget accounts={accounts} transactions={filtered} hidden={hidden} mask={mask} />
        </div>

        {/* Monthly Comparison */}
        <div className="col-span-2 lg:col-span-4">
          <MonthlyComparisonWidget accounts={accounts} transactions={transactions} hidden={hidden} mask={mask} />
        </div>

        {/* Spending Pie Chart - hide when no data */}
        {categorySpending.length > 0 && (
          <Card className="col-span-2 lg:col-span-2">
            <h2 className="font-heading text-sm mb-3">Spending Breakdown</h2>
            <SpendingPieChart data={categorySpending.map(([cat, data]) => ({ name: cat, value: data.total, icon: data.icon }))} />
          </Card>
        )}

        {/* Monthly Trend Line Chart - hide when no transactions */}
        {transactions.length > 0 && (
          <Card className="col-span-2 lg:col-span-2">
            <h2 className="font-heading text-sm mb-3">Monthly Trends</h2>
            <MonthlyTrendChart transactions={transactions} creditAccountIds={creditAccountIds} />
          </Card>
        )}

        {/* Category spending list - hide when no data */}
        {categorySpending.length > 0 && (
          <Card className="col-span-2 lg:col-span-2">
            <h2 className="font-heading text-sm mb-3">Spending by Category</h2>
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

        {/* Budget overview */}
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
          {/* Top over-budget categories */}
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

        {/* Upcoming Bills */}
        <div className="col-span-2 lg:col-span-2">
          <UpcomingBillsWidget accounts={accounts} transactions={transactions} />
        </div>

        <div className="col-span-2 lg:col-span-4">
          <RecurringTracker />
        </div>

        {/* Monthly AI Report */}
        <div className="col-span-2 lg:col-span-2">
          <MonthlyReportCard transactions={transactions} budgets={budgets} goals={goals} accounts={accounts} />
        </div>

        {/* AI Summary */}
        <Card className="col-span-2 lg:col-span-2 border border-dashed border-primary/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-primary" />
            </div>
            <h2 className="font-heading text-sm">AI Summary</h2>
          </div>
          {summaryText ? (
            <>
              <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{summaryText}</div>
              <button onClick={handleGenerateSummary} disabled={aiLoading}
                className="mt-3 w-full py-2 rounded-xl bg-accent text-accent-foreground text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                {aiLoading ? <><Loader2 size={14} className="animate-spin" /> Regenerating…</> : <><Sparkles size={14} /> Regenerate</>}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">Your month in plain English</p>
              <button onClick={handleGenerateSummary} disabled={aiLoading}
                className="w-full py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                {aiLoading ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate Summary</>}
              </button>
            </>
          )}
        </Card>

        {/* Recent Transactions - spans full */}
        {recentTx.length > 0 && (
          <Card className="col-span-2 lg:col-span-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-sm">Recent Transactions</h2>
              <button onClick={() => navigate('/transactions')} className="text-xs text-primary font-medium flex items-center gap-0.5">View all <ChevronRight size={14} /></button>
            </div>
            <div className="space-y-3">
              {recentTx.map(tx => (
                <div key={tx.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{extractEmoji(tx.categoryIcon)}</span>
                    <div>
                      <p className="text-sm font-medium">{tx.merchant}</p>
                      <p className="text-xs text-muted-foreground">{format(parseISO(tx.date), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-heading ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {fmtSigned(tx.amount, tx.type as 'income' | 'expense')}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}
        </div>{/* end grid */}
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
