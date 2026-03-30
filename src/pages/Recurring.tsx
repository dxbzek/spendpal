import { PageSpinner } from '@/components/ui/spinner';
import { useMemo, useState } from 'react';
import { format, parseISO, getMonth, getYear } from 'date-fns';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { RefreshCw, Check, Plus, TrendingDown } from 'lucide-react';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';

interface RecurringGroup {
  key: string;
  merchant: string;
  category: string;
  categoryIcon: string;
  avgAmount: number;
  lastDate: string;
  paidThisMonth: boolean;
}

const Recurring = () => {
  const { transactions, loading } = useFinance();
  const { fmt } = useCurrency();
  const [addOpen, setAddOpen] = useState(false);

  const now = new Date();
  const thisMonth = getMonth(now);
  const thisYear = getYear(now);

  const groups = useMemo<RecurringGroup[]>(() => {
    const recurring = transactions.filter(tx => tx.isRecurring && tx.type === 'expense');
    const map: Record<string, typeof recurring> = {};
    recurring.forEach(tx => {
      const key = `${tx.merchant}|${tx.category}`;
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });

    return Object.entries(map)
      .map(([key, txs]) => {
        const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
        const latest = sorted[0];
        const avgAmount = txs.reduce((s, t) => s + t.amount, 0) / txs.length;
        const paidThisMonth = txs.some(tx => {
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
          paidThisMonth,
        };
      })
      .sort((a, b) => Number(a.paidThisMonth) - Number(b.paidThisMonth));
  }, [transactions, thisMonth, thisYear]);

  const dueCount = groups.filter(g => !g.paidThisMonth).length;
  const paidCount = groups.filter(g => g.paidThisMonth).length;
  const monthlyCommitted = groups.reduce((s, g) => s + g.avgAmount, 0);
  const dueTotal = groups.filter(g => !g.paidThisMonth).reduce((s, g) => s + g.avgAmount, 0);

  if (loading) return <PageSpinner />;

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
          onClick={() => setAddOpen(true)}
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
              <span className="font-semibold text-sm">{fmt(monthlyCommitted)}</span>
              {dueTotal > 0 && <p className="text-[11px] text-destructive font-medium">{fmt(dueTotal)} still due</p>}
            </div>
          </div>
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
        <div className="space-y-3">
          {groups.map(group => (
            <div
              key={group.key}
              className={`bg-card rounded-2xl border border-border p-4 flex items-center justify-between gap-3 transition-opacity ${
                group.paidThisMonth ? 'opacity-55' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                  group.paidThisMonth ? 'bg-primary/10' : 'bg-accent'
                }`}>
                  {group.categoryIcon}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{group.merchant}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {group.category} · last {format(parseISO(group.lastDate), 'd MMM yyyy')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="font-semibold">{fmt(group.avgAmount)}</p>
                  <p className="text-xs text-muted-foreground">avg/mo</p>
                </div>
                {group.paidThisMonth ? (
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <Check size={16} className="text-primary" />
                  </div>
                ) : (
                  <button
                    onClick={() => setAddOpen(true)}
                    className="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary hover:text-primary transition-colors shrink-0"
                    aria-label="Log payment"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddTransactionSheet open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
};

export default Recurring;
