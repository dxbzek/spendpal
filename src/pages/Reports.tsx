import { useMemo, useState } from 'react';
import { format, parseISO, subMonths } from 'date-fns';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import MonthlyTrendChart from '@/components/charts/MonthlyTrendChart';
import SpendingPieChart from '@/components/charts/SpendingPieChart';
import { BarChart3, TrendingUp, TrendingDown, Minus, X, Receipt } from 'lucide-react';

const Reports = () => {
  const { transactions, accounts, budgets } = useFinance();
  const { fmt } = useCurrency();

  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const creditAccountIds = useMemo(
    () => new Set(accounts.filter(a => a.type === 'credit').map(a => a.id)),
    [accounts]
  );

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(new Date(), i);
      return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') };
    });
  }, []);

  const monthTxs = useMemo(
    () => transactions.filter(tx => tx.date.startsWith(selectedMonth)),
    [transactions, selectedMonth]
  );

  const prevMonthStr = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return format(subMonths(new Date(y, m - 1), 1), 'yyyy-MM');
  }, [selectedMonth]);

  const prevMonthTxs = useMemo(
    () => transactions.filter(tx => tx.date.startsWith(prevMonthStr)),
    [transactions, prevMonthStr]
  );

  const income = useMemo(
    () => monthTxs
      .filter(tx => tx.type === 'income' && !creditAccountIds.has(tx.accountId))
      .reduce((s, tx) => s + tx.amount, 0),
    [monthTxs, creditAccountIds]
  );

  const expenses = useMemo(
    () => monthTxs.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0),
    [monthTxs]
  );

  const prevExpenses = useMemo(
    () => prevMonthTxs.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0),
    [prevMonthTxs]
  );

  const expenseChange = prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : null;
  const net = income - expenses;

  const categoryData = useMemo(() => {
    const map: Record<string, { value: number; icon: string }> = {};
    monthTxs.filter(tx => tx.type === 'expense').forEach(tx => {
      if (!map[tx.category]) map[tx.category] = { value: 0, icon: tx.categoryIcon };
      map[tx.category].value += tx.amount;
    });
    return Object.entries(map)
      .map(([name, { value, icon }]) => ({ name, value, icon }))
      .sort((a, b) => b.value - a.value);
  }, [monthTxs]);

  const topMerchants = useMemo(() => {
    const map: Record<string, number> = {};
    monthTxs.filter(tx => tx.type === 'expense').forEach(tx => {
      map[tx.merchant] = (map[tx.merchant] || 0) + tx.amount;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([merchant, amount]) => ({ merchant, amount }));
  }, [monthTxs]);

  const monthBudgets = useMemo(
    () => budgets.filter(b => b.period === 'monthly' && b.month === selectedMonth),
    [budgets, selectedMonth]
  );

  const hasData = categoryData.length > 0 || topMerchants.length > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">Analytics &amp; financial insights</p>
        </div>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {months.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-border p-3 text-center">
          <TrendingUp size={18} className="text-primary mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">Income</p>
          <p className="font-bold text-sm">{fmt(income)}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-3 text-center">
          <TrendingDown size={18} className="text-destructive mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">Expenses</p>
          <p className="font-bold text-sm">{fmt(expenses)}</p>
          {expenseChange !== null && (
            <p className={`text-[10px] font-medium ${expenseChange > 0 ? 'text-destructive' : 'text-primary'}`}>
              {expenseChange > 0 ? '+' : ''}{expenseChange.toFixed(1)}% vs prev
            </p>
          )}
        </div>
        <div className="bg-card rounded-2xl border border-border p-3 text-center">
          <Minus size={18} className={`mx-auto mb-1 ${net >= 0 ? 'text-primary' : 'text-destructive'}`} />
          <p className="text-xs text-muted-foreground">Net</p>
          <p className={`font-bold text-sm ${net >= 0 ? 'text-primary' : 'text-destructive'}`}>
            {net < 0 ? '-' : ''}{fmt(Math.abs(net))}
          </p>
        </div>
      </div>

      {/* 6-Month Trend */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <h2 className="font-semibold text-sm mb-3">6-Month Trend</h2>
        <MonthlyTrendChart transactions={transactions} creditAccountIds={creditAccountIds} />
      </div>

      {/* Spending by Category */}
      {categoryData.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-sm mb-3">Spending by Category</h2>
          <SpendingPieChart data={categoryData} />
          <div className="mt-3 space-y-1.5">
            {categoryData.map(cat => (
              <button
                key={cat.name}
                onClick={() => setDrillCategory(drillCategory === cat.name ? null : cat.name)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${drillCategory === cat.name ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/60'}`}
              >
                <span className="flex items-center gap-2">
                  <span>{cat.icon}</span>
                  <span className="font-medium">{cat.name}</span>
                </span>
                <span className="font-semibold">{fmt(cat.value)}</span>
              </button>
            ))}
          </div>

          {/* Drill-through panel */}
          {drillCategory && (() => {
            const catTxs = monthTxs.filter(tx => tx.type === 'expense' && tx.category === drillCategory);
            return (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{drillCategory} transactions</p>
                  <button onClick={() => setDrillCategory(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {catTxs.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">No transactions</p>
                  ) : catTxs.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/40">
                      <div className="flex items-center gap-2 min-w-0">
                        <Receipt size={11} className="text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{tx.merchant}</p>
                          <p className="text-[10px] text-muted-foreground">{format(parseISO(tx.date), 'MMM d')}</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-expense shrink-0 ml-2">{fmt(tx.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Budget Performance */}
      {monthBudgets.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-sm">Budget Performance</h2>
          {monthBudgets.map(b => {
            const pct = b.amount > 0 ? Math.min((b.spent / b.amount) * 100, 100) : 0;
            const over = b.spent > b.amount;
            return (
              <div key={b.id} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-1">
                    <span>{b.categoryIcon}</span>
                    <span>{b.category}</span>
                  </span>
                  <span className={over ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                    {fmt(b.spent)} / {fmt(b.amount)}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      over ? 'bg-destructive' : pct > 75 ? 'bg-warning' : 'bg-primary'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Top Merchants */}
      {topMerchants.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-sm mb-3">Top Merchants</h2>
          <div className="space-y-2">
            {topMerchants.map(({ merchant, amount }, i) => (
              <div key={merchant} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                  <span className="text-sm truncate">{merchant}</span>
                </div>
                <span className="text-sm font-medium shrink-0">{fmt(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasData && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">
            No data for {format(parseISO(selectedMonth + '-01'), 'MMMM yyyy')}
          </p>
          <p className="text-sm">Add some transactions to see reports</p>
        </div>
      )}
    </div>
  );
};

export default Reports;
