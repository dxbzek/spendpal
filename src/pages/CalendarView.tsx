import { PageSpinner } from '@/components/ui/spinner';
import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay, format, parseISO,
  addMonths, subMonths, isSameDay, isSameMonth,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { extractEmoji } from '@/utils/categoryColors';

const CalendarView = () => {
  const { transactions, accounts, loading } = useFinance();
  const { fmt } = useCurrency();
  const { hidden, mask } = useBalanceMask();
  const [current, setCurrent] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const creditAccountIds = useMemo(
    () => new Set(accounts.filter(a => a.type === 'credit').map(a => a.id)),
    [accounts]
  );

  const monthTxs = useMemo(() =>
    transactions.filter(tx => {
      const d = parseISO(tx.date);
      return isSameMonth(d, current);
    }),
    [transactions, current]
  );

  // Spending per day
  const dayTotals = useMemo(() => {
    const map: Record<string, number> = {};
    monthTxs.filter(tx => tx.type === 'expense' && tx.category !== 'Transfer' && !tx.isTrackingOnly).forEach(tx => {
      map[tx.date] = (map[tx.date] || 0) + tx.amount;
    });
    return map;
  }, [monthTxs]);

  // Income per day (exclude credit card credits)
  const dayIncome = useMemo(() => {
    const map: Record<string, number> = {};
    monthTxs
      .filter(tx => tx.type === 'income' && tx.category !== 'Transfer' && !creditAccountIds.has(tx.accountId))
      .forEach(tx => { map[tx.date] = (map[tx.date] || 0) + tx.amount; });
    return map;
  }, [monthTxs, creditAccountIds]);

  const maxDay = Math.max(...Object.values(dayTotals), 1);

  // Build calendar grid (Mon-start)
  const days = useMemo(() => {
    const start = startOfMonth(current);
    const end = endOfMonth(current);
    const all = eachDayOfInterval({ start, end });
    // pad start (Mon=0...Sun=6, but getDay is Sun=0)
    const startDow = (getDay(start) + 6) % 7; // convert to Mon=0
    return { all, startDow };
  }, [current]);

  const selectedTxs = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, 'yyyy-MM-dd');
    return monthTxs.filter(tx => tx.date === key);
  }, [selectedDay, monthTxs]);

  const totalIncome = useMemo(
    () => monthTxs.filter(t => t.type === 'income' && t.category !== 'Transfer' && !creditAccountIds.has(t.accountId)).reduce((s, t) => s + t.amount, 0),
    [monthTxs, creditAccountIds]
  );
  const totalExpenses = useMemo(() => monthTxs.filter(t => t.type === 'expense' && t.category !== 'Transfer' && !t.isTrackingOnly).reduce((s, t) => s + t.amount, 0), [monthTxs]);

  const dayColor = (total: number) => {
    if (!total) return '';
    const ratio = total / maxDay;
    if (ratio > 0.7) return 'bg-expense/80';
    if (ratio > 0.4) return 'bg-warning/70';
    if (ratio > 0.15) return 'bg-primary/50';
    return 'bg-primary/25';
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Spending by day</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrent(d => subMonths(d, 1))} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold min-w-[110px] text-center">{format(current, 'MMMM yyyy')}</span>
          <button onClick={() => setCurrent(d => addMonths(d, 1))} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Month summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Income</p>
          <p className="font-bold text-primary text-sm">{mask(fmt(totalIncome))}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Expenses</p>
          <p className="font-bold text-expense text-sm">{mask(fmt(totalExpenses))}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Net</p>
          <p className={`font-bold text-sm ${totalIncome - totalExpenses >= 0 ? 'text-primary' : 'text-expense'}`}>
            {hidden ? '••••••' : `${totalIncome - totalExpenses < 0 ? '-' : '+'}${fmt(Math.abs(totalIncome - totalExpenses))}`}
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span>Spending:</span>
        {[['bg-primary/25', 'Low'], ['bg-primary/50', 'Med'], ['bg-warning/70', 'High'], ['bg-expense/80', 'Very high']].map(([cls, label]) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`w-3 h-1.5 rounded-full ${cls}`} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1 ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-income" />
          Income
        </span>
      </div>

      {/* Calendar grid */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid grid-cols-7">
          {/* Padding cells */}
          {Array.from({ length: days.startDow }).map((_, i) => (
            <div key={`pad-${i}`} className="h-14 border-b border-r border-border/50 last:border-r-0" />
          ))}

          {days.all.map((day, i) => {
            const key = format(day, 'yyyy-MM-dd');
            const total = dayTotals[key] || 0;
            const income = dayIncome[key] || 0;
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            const isToday = isSameDay(day, new Date());
            const colPos = (days.startDow + i) % 7;
            return (
              <button
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`h-14 flex flex-col items-center pt-1.5 gap-0.5 border-b border-r border-border/50 last:border-r-0 transition-colors relative
                  ${isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary' : 'hover:bg-muted/50'}
                  ${colPos === 6 ? 'border-r-0' : ''}`}
              >
                <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                  ${isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </span>
                <div className="flex items-center gap-0.5">
                  {total > 0 && (
                    <div className={`w-4 h-1.5 rounded-full ${dayColor(total)}`} />
                  )}
                  {income > 0 && (
                    <div className="w-1.5 h-1.5 rounded-full bg-income shrink-0" />
                  )}
                </div>
                {total > 0 && !hidden && (
                  <span className="text-[9px] text-muted-foreground leading-none">{fmt(total)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day transactions */}
      {selectedDay && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">{format(selectedDay, 'EEEE, MMMM d')}</p>
            <p className="text-xs text-muted-foreground">{selectedTxs.length} transaction{selectedTxs.length !== 1 ? 's' : ''}</p>
          </div>
          {selectedTxs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarDays size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No transactions on this day</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {selectedTxs.map(tx => (
                <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{extractEmoji(tx.categoryIcon)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tx.merchant}</p>
                      <p className="text-xs text-muted-foreground">{tx.category}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {tx.type === 'income' ? '+' : '-'}{mask(fmt(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CalendarView;
