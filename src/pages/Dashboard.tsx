import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useAuth } from '@/context/AuthContext';
import { useCurrency } from '@/context/CurrencyContext';
import { Eye, EyeOff, Plus, ChevronRight, Sparkles, Loader2, Settings, Trash2, Edit2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { useAI } from '@/hooks/useAI';
import { useBudgetAlerts } from '@/hooks/useBudgetAlerts';
import AddAccountDialog from '@/components/forms/AddAccountDialog';
import SpendingPieChart from '@/components/charts/SpendingPieChart';
import MonthlyTrendChart from '@/components/charts/MonthlyTrendChart';
import type { Account } from '@/types/finance';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const Dashboard = () => {
  const { accounts, transactions, budgets, removeAccount, loading: dataLoading } = useFinance();
  const { signOut } = useAuth();
  const { fmt, fmtSigned } = useCurrency();
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
  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts]);
  const now = new Date();

  const filtered = useMemo(() => {
    if (period === 'all') return transactions;
    return transactions.filter(tx => {
      const d = parseISO(tx.date);
      if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return d.getFullYear() === now.getFullYear();
    });
  }, [transactions, period]);

  const income = useMemo(() => filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [filtered]);
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
    <div className={`bg-card rounded-2xl p-4 card-shadow ${className}`}>{children}</div>
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
    <div className="animate-fade-in">
      {/* Header */}
      <div className="gradient-primary px-5 pt-12 pb-8 rounded-b-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl text-primary-foreground font-heading">Financial Overview</h1>
          <div className="flex items-center gap-2">
            <button onClick={toggleHidden} className="text-primary-foreground/80">
              {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
            <button onClick={() => navigate('/settings')} className="text-primary-foreground/80">
              <Settings size={20} />
            </button>
          </div>
        </div>
        <div className="text-center">
          <p className="text-primary-foreground/70 text-sm mb-1">Total Balance</p>
          <p className="text-3xl font-heading text-primary-foreground">{mask(fmt(totalBalance))}</p>
        </div>
        <div className="flex justify-center mt-4">
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

      <div className="px-5 -mt-4 space-y-4 pb-6">
        <div className="grid grid-cols-2 gap-3">
          <Card><p className="text-xs text-muted-foreground mb-1">Income</p><p className="text-lg font-heading text-income">{mask(fmt(income))}</p></Card>
          <Card><p className="text-xs text-muted-foreground mb-1">Expenses</p><p className="text-lg font-heading text-expense">{mask(fmt(expenses))}</p></Card>
        </div>

        {/* Accounts */}
        <Card>
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
                      const utilization = a.type === 'credit' && a.creditLimit ? Math.min(Math.round((Math.abs(a.balance) / a.creditLimit) * 100), 100) : 0;
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
                                    {a.statementDate && <span>Stmt: {a.statementDate}th</span>}
                                    {a.dueDate && <span>Due: {a.dueDate}th</span>}
                                    {a.creditLimit && <span>Limit: {fmt(a.creditLimit)}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className={`font-heading text-sm ${a.balance < 0 ? 'text-expense' : ''}`}>{mask(fmt(a.balance))}</p>
                              <button onClick={() => { setEditAccount(a); setShowAddAccount(true); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-1">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => setDeleteAccountId(a.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          {a.type === 'credit' && a.creditLimit && (
                            <div className="mt-1.5 ml-11">
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                                <span>{utilization}% used</span>
                                <span>{fmt(Math.abs(a.balance))} / {fmt(a.creditLimit)}</span>
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

        {/* Spending Pie Chart */}
        <Card>
          <h2 className="font-heading text-sm mb-3">Spending Breakdown</h2>
          <SpendingPieChart data={categorySpending.map(([cat, data]) => ({ name: cat, value: data.total, icon: data.icon }))} />
        </Card>

        {/* Monthly Trend Line Chart */}
        <Card>
          <h2 className="font-heading text-sm mb-3">Monthly Trends</h2>
          <MonthlyTrendChart transactions={transactions} />
        </Card>

        {/* Category spending list */}
        <Card>
          <h2 className="font-heading text-sm mb-3">Spending by Category</h2>
          {categorySpending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No categorized expenses</p>
          ) : (
            <div className="space-y-2.5">
              {categorySpending.slice(0, 5).map(([cat, data]) => {
                const pct = expenses ? Math.round((data.total / expenses) * 100) : 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm flex items-center gap-2"><span>{data.icon}</span> {cat}</span>
                      <span className="text-sm font-medium">{fmt(data.total)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full bg-primary" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Budget overview */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-heading text-sm">Budget Overview</h2>
            <button onClick={() => navigate('/budgets')} className="text-xs text-primary font-medium flex items-center gap-0.5">View all <ChevronRight size={14} /></button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{budgetPct}% spent</span><span>{fmt(totalSpent)} / {fmt(totalBudgeted)}</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(budgetPct, 100)}%` }} transition={{ duration: 0.6 }}
              className={`h-full rounded-full ${budgetPct > 90 ? 'bg-expense' : 'bg-primary'}`} />
          </div>
        </Card>

        {creditCards.length > 0 && (
          <Card>
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

        {recurring.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-sm">Recurring Expenses</h2>
              <span className="text-xs font-medium text-expense">{fmt(recurringTotal)}/mo</span>
            </div>
            <div className="space-y-2">
              {recurring.map(r => (
                <div key={r.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2"><span className="text-lg">{r.categoryIcon}</span><span className="text-sm">{r.merchant}</span></div>
                  <span className="text-sm font-medium">{fmt(r.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* AI Summary */}
        <Card className="border border-dashed border-primary/30">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-primary" />
            <h2 className="font-heading text-sm">AI Summary</h2>
          </div>
          {summaryText ? (
            <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{summaryText}</div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">Your month in plain English</p>
          )}
          {!summaryText && (
            <button onClick={handleGenerateSummary} disabled={aiLoading}
              className="w-full py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
              {aiLoading ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate Summary</>}
            </button>
          )}
        </Card>

        {/* Recent Transactions */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-sm">Recent Transactions</h2>
            <button onClick={() => navigate('/transactions')} className="text-xs text-primary font-medium flex items-center gap-0.5">View all <ChevronRight size={14} /></button>
          </div>
          {recentTx.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No transactions yet</p>
          ) : (
            <div className="space-y-3">
              {recentTx.map(tx => (
                <div key={tx.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{tx.categoryIcon}</span>
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
          )}
        </Card>
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
