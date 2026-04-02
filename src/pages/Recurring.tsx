import { PageSpinner } from '@/components/ui/spinner';
import { useMemo, useState } from 'react';
import { format, parseISO, getMonth, getYear } from 'date-fns';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { RefreshCw, Check, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';
import type { TransactionType } from '@/types/finance';

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

const Recurring = () => {
  const { transactions, loading } = useFinance();
  const { fmt } = useCurrency();
  const [addOpen, setAddOpen] = useState(false);
  const [prefillGroup, setPrefillGroup] = useState<RecurringGroup | null>(null);

  const hidden = localStorage.getItem('balanceHidden') === 'true';
  const mask = (val: string) => hidden ? '••••••' : val;

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

    return Object.entries(map)
      .map(([key, txs]) => {
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
      })
      .sort((a, b) => Number(a.loggedThisMonth) - Number(b.loggedThisMonth));
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

  const renderGroup = (group: RecurringGroup) => (
    <div
      key={group.key}
      className={`bg-card rounded-2xl border border-border p-4 flex items-center justify-between gap-3 transition-opacity ${
        group.loggedThisMonth ? 'opacity-55' : ''
      }`}
    >
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
            onClick={() => handleLogPayment(group)}
            className="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary hover:text-primary transition-colors shrink-0"
            aria-label={group.type === 'income' ? 'Log income' : 'Log payment'}
          >
            <Plus size={14} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Recurring</h1>
          <p className="text-sm text-muted-foreground">
            {dueCount > 0
              ? `${dueCount} due this month · ${paidCount} paid`
              : groups.length > 0
              ? 'All caught up this month'
              : 'No recurring transactions'}
          </p>
        </div>
        <button
          onClick={() => { setPrefillGroup(null); setAddOpen(true); }}
          className="gradient-primary text-primary-foreground rounded-xl px-3 py-2 text-sm font-medium flex items-center gap-1.5 shadow-fab active:scale-95 transition-transform"
        >
          <Plus size={15} /> Log Payment
        </button>
      </div>

      {/* Summary pills */}
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

      {/* Groups */}
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
              {expenseGroups.map(renderGroup)}
            </div>
          )}
          {incomeGroups.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Income</p>
              {incomeGroups.map(renderGroup)}
            </div>
          )}
        </div>
      )}

      <AddTransactionSheet
        open={addOpen}
        onOpenChange={handleAddOpen}
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

export default Recurring;
