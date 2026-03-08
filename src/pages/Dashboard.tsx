import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { Eye, EyeOff, Plus, ChevronRight, Sparkles, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { useAI } from '@/hooks/useAI';
import AddAccountDialog from '@/components/forms/AddAccountDialog';

const Dashboard = () => {
  const { accounts, transactions, budgets } = useFinance();
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(false);
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [showAddAccount, setShowAddAccount] = useState(false);
  const { loading: aiLoading, summaryText, generateSummary } = useAI();

  const mask = (val: string) => hidden ? '••••••' : val;

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts]);

  const now = new Date();
  const filtered = useMemo(() => {
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

  const fmt = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="gradient-primary px-5 pt-12 pb-8 rounded-b-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl text-primary-foreground font-heading">Financial Overview</h1>
          <button onClick={() => setHidden(!hidden)} className="text-primary-foreground/80">
            {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        <div className="text-center">
          <p className="text-primary-foreground/70 text-sm mb-1">Total Balance</p>
          <p className="text-3xl font-heading text-primary-foreground">
            {mask(`د.إ ${fmt(totalBalance)}`)}
          </p>
        </div>
        <div className="flex justify-center mt-4">
          <div className="flex gap-1 p-0.5 bg-primary-foreground/10 rounded-lg">
            {(['month', 'year'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                  period === p ? 'bg-primary-foreground/20 text-primary-foreground' : 'text-primary-foreground/60'
                }`}>
                This {p === 'month' ? 'Month' : 'Year'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* Income & Expenses */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="text-xs text-muted-foreground mb-1">Income</p>
            <p className="text-lg font-heading text-income">{mask(`د.إ ${fmt(income)}`)}</p>
          </Card>
          <Card>
            <p className="text-xs text-muted-foreground mb-1">Expenses</p>
            <p className="text-lg font-heading text-expense">{mask(`د.إ ${fmt(expenses)}`)}</p>
          </Card>
        </div>

        {/* Accounts */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-sm">Accounts</h2>
            <button onClick={() => setShowAddAccount(true)} className="text-xs text-primary font-medium flex items-center gap-1">
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="space-y-3">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{a.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{a.type}</p>
                  </div>
                </div>
                <p className={`font-heading text-sm ${a.balance < 0 ? 'text-expense' : ''}`}>
                  {mask(`د.إ ${fmt(a.balance)}`)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* Spending by Category */}
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
                      <span className="text-sm font-medium">د.إ {fmt(data.total)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full rounded-full bg-primary" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Budget Overview */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-heading text-sm">Budget Overview</h2>
            <button onClick={() => navigate('/budgets')} className="text-xs text-primary font-medium flex items-center gap-0.5">
              View all <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{budgetPct}% spent</span>
            <span>د.إ {fmt(totalSpent)} / {fmt(totalBudgeted)}</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(budgetPct, 100)}%` }}
              transition={{ duration: 0.6 }}
              className={`h-full rounded-full ${budgetPct > 90 ? 'bg-expense' : 'bg-primary'}`} />
          </div>
        </Card>

        {/* Credit Card Due Dates */}
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
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cc.icon}</span>
                      <span className="text-sm">{cc.name}</span>
                    </div>
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

        {/* Recurring Expenses */}
        {recurring.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-sm">Recurring Expenses</h2>
              <span className="text-xs font-medium text-expense">د.إ {fmt(recurringTotal)}/mo</span>
            </div>
            <div className="space-y-2">
              {recurring.map(r => (
                <div key={r.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{r.categoryIcon}</span>
                    <span className="text-sm">{r.merchant}</span>
                  </div>
                  <span className="text-sm font-medium">د.إ {fmt(r.amount)}</span>
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
            <button onClick={() => navigate('/transactions')} className="text-xs text-primary font-medium flex items-center gap-0.5">
              View all <ChevronRight size={14} />
            </button>
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
                    {tx.type === 'income' ? '+' : '-'}د.إ {tx.amount.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="h-4" />
      <AddAccountDialog open={showAddAccount} onOpenChange={setShowAddAccount} />
    </div>
  );
};

export default Dashboard;
