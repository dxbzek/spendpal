import { PageSpinner } from '@/components/ui/spinner';
import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { type Account } from '@/types/finance';
import AddAccountDialog from '@/components/forms/AddAccountDialog';
import { Wallet, Pencil, Trash2, Plus, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, addDays } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const TYPE_LABELS: Record<string, string> = {
  cash: 'Cash',
  debit: 'Debit Card',
  credit: 'Credit Card',
};

const TYPE_COLORS: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  debit: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  credit: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const Accounts = () => {
  const { accounts, transactions, removeAccount, loading } = useFinance();
  const { fmt } = useCurrency();
  const { hidden, mask } = useBalanceMask();

  const [addOpen, setAddOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const netWorth = useMemo(() => {
    const assets = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0);
    const liabilities = accounts.filter(a => a.type === 'credit').reduce((s, a) => {
      const spent = a.creditLimit ? a.creditLimit - a.balance : 0;
      return s + spent;
    }, 0);
    return assets - liabilities;
  }, [accounts]);

  const accountStats = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    const stats: Record<string, { income: number; expenses: number }> = {};
    transactions.forEach(tx => {
      if (tx.date.slice(0, 7) !== thisMonth) return;
      if (!stats[tx.accountId]) stats[tx.accountId] = { income: 0, expenses: 0 };
      if (tx.type === 'income') stats[tx.accountId].income += tx.amount;
      else if (tx.type === 'expense') stats[tx.accountId].expenses += tx.amount;
    });
    return stats;
  }, [transactions]);

  // Balance projection: project total assets 30 days forward using recurring transactions
  const balanceProjection = useMemo(() => {
    const assetAccs = accounts.filter(a => a.type !== 'credit');
    if (assetAccs.length === 0) return null;
    const startBalance = assetAccs.reduce((s, a) => s + a.balance, 0);
    const recurring = transactions.filter(t => t.isRecurring);
    const now = new Date();
    const points: Array<{ day: number; balance: number }> = [{ day: 0, balance: startBalance }];
    let running = startBalance;
    for (let d = 1; d <= 30; d++) {
      const date = addDays(now, d);
      // Check for recurring transactions due this day of month
      recurring.forEach(r => {
        const lastDate = parseISO(r.date);
        if (lastDate.getDate() === date.getDate()) {
          if (r.type === 'expense') running -= r.amount;
          else if (r.type === 'income') running += r.amount;
        }
      });
      points.push({ day: d, balance: running });
    }
    // Build SVG path
    const vals = points.map(p => p.balance);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const W = 100, H = 36;
    const pts = points.map(p => {
      const x = (p.day / 30) * W;
      const y = H - ((p.balance - min) / range) * H;
      return `${x},${y}`;
    }).join(' ');
    const end = points[points.length - 1].balance;
    const change = end - startBalance;
    return { pts, startBalance, endBalance: end, change };
  }, [accounts, transactions]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await removeAccount(deleteId);
    setDeleteId(null);
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Accounts</h1>
          <p className="text-sm text-muted-foreground">Manage your financial accounts</p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          size="sm"
          className="gradient-primary text-primary-foreground shadow-fab"
        >
          <Plus size={16} className="mr-1" /> Add Account
        </Button>
      </div>

      {/* Net Worth Summary */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-5">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Total Net Worth</p>
        <p className={`text-3xl font-bold font-heading ${netWorth >= 0 ? 'text-foreground' : 'text-destructive'}`}>
          {mask(fmt(Math.abs(netWorth)))}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {accounts.length} account{accounts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Account Cards */}
      {accounts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Wallet size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No accounts yet</p>
          <p className="text-sm">Add your first account to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(account => {
            const stats = accountStats[account.id] || { income: 0, expenses: 0 };
            const utilization =
              account.type === 'credit' && account.creditLimit
                ? ((account.creditLimit - account.balance) / account.creditLimit) * 100
                : null;

            return (
              <div key={account.id} className="bg-card rounded-2xl border border-border p-4 space-y-3">
                {/* Top row: icon + name + actions */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-xl shrink-0">
                      {account.icon}
                    </div>
                    <div>
                      <p className="font-semibold">{account.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[account.type]}`}>
                        {TYPE_LABELS[account.type]}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditAccount(account); setAddOpen(true); }}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Edit account"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setDeleteId(account.id)}
                      className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Delete account"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Balance row */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p className="text-xl font-bold font-heading">{mask(fmt(account.balance))}</p>
                  </div>
                  {account.type === 'credit' && account.creditLimit && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Credit limit</p>
                      <p className="text-sm font-medium">{mask(fmt(account.creditLimit))}</p>
                    </div>
                  )}
                </div>

                {/* Credit utilization bar */}
                {utilization !== null && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Utilization</span>
                      <span className={
                        utilization > 75 ? 'text-destructive font-semibold' :
                        utilization > 30 ? 'text-warning font-semibold' : 'text-primary'
                      }>
                        {Math.round(utilization)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          utilization > 75 ? 'bg-destructive' :
                          utilization > 30 ? 'bg-warning' : 'bg-primary'
                        }`}
                        style={{ width: `${Math.min(utilization, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* This-month in/out stats */}
                {(stats.income > 0 || stats.expenses > 0) && (
                  <div className="flex gap-4 pt-1 border-t border-border">
                    {stats.income > 0 && (
                      <div className="flex items-center gap-1 text-xs">
                        <TrendingUp size={12} className="text-primary" />
                        <span className="text-muted-foreground">In:</span>
                        <span className="font-medium text-primary">{mask(fmt(stats.income))}</span>
                      </div>
                    )}
                    {stats.expenses > 0 && (
                      <div className="flex items-center gap-1 text-xs">
                        <TrendingDown size={12} className="text-destructive" />
                        <span className="text-muted-foreground">Out:</span>
                        <span className="font-medium text-destructive">{mask(fmt(stats.expenses))}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Transactions toggle */}
                <button
                  onClick={() => setExpandedId(expandedId === account.id ? null : account.id)}
                  className="w-full flex items-center justify-between pt-2 border-t border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1"><Receipt size={11} /> Recent transactions</span>
                  {expandedId === account.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>

                {/* Inline transactions */}
                {expandedId === account.id && (() => {
                  const acctTxs = transactions
                    .filter(tx => tx.accountId === account.id)
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 10);
                  return (
                    <div className="space-y-1.5 pt-1">
                      {acctTxs.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">No transactions yet</p>
                      ) : (
                        <>
                          {acctTxs.map(tx => (
                            <div key={tx.id} className="flex items-center justify-between py-1 px-2 rounded-lg bg-muted/40">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-base shrink-0">{tx.categoryIcon}</span>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{tx.merchant}</p>
                                  <p className="text-[10px] text-muted-foreground">{format(parseISO(tx.date), 'MMM d, yyyy')}</p>
                                </div>
                              </div>
                              <span className={`text-xs font-semibold shrink-0 ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                                {tx.type === 'income' ? '+' : '-'}{mask(fmt(tx.amount))}
                              </span>
                            </div>
                          ))}
                          <button
                            onClick={() => navigate('/transactions')}
                            className="w-full text-xs text-primary font-medium text-center py-1 hover:underline"
                          >
                            See all transactions →
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Balance Projection */}
      {balanceProjection && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">30-Day Balance Projection</h2>
            <span className={`text-xs font-semibold ${balanceProjection.change >= 0 ? 'text-income' : 'text-expense'}`}>
              {hidden ? '••••••' : `${balanceProjection.change >= 0 ? '+' : ''}${fmt(balanceProjection.change)}`}
            </span>
          </div>
          <svg viewBox="0 0 100 36" className="w-full h-12" preserveAspectRatio="none">
            <defs>
              <linearGradient id="proj-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline points={balanceProjection.pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <polygon points={`0,36 ${balanceProjection.pts} 100,36`} fill="url(#proj-grad)" />
          </svg>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Today: {mask(fmt(balanceProjection.startBalance))}</span>
            <span>+30d: {mask(fmt(balanceProjection.endBalance))}</span>
          </div>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <AddAccountDialog
        open={addOpen}
        onOpenChange={o => { setAddOpen(o); if (!o) setEditAccount(null); }}
        editAccount={editAccount}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the account. Existing transactions linked to it will remain but may show an unknown account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Accounts;
