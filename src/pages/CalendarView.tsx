import { PageSpinner } from '@/components/ui/spinner';
import { NARROW_PAGE } from '@/lib/pageLayout';
import { incomeAndSpending, isCountableExpense, isCountableIncome } from '@/lib/finance/transactionFilters';
import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay, format, parseISO,
  addMonths, subMonths, isSameDay, isSameMonth,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import AppIcon from '@/components/AppIcon';
import { PageHeader, IconButton, HeroCard, HeroChip, SectionLabel, ListCard, ListRow, BigAmount } from '@/components/orbix';
import { cn } from '@/lib/utils';
import { useToday } from '@/hooks/useToday';

const CalendarView = () => {
  const { transactions, accounts, loading } = useFinance();
  const { fmt } = useCurrency();
  const { hidden } = useBalanceMask();
  const today = useToday();
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
    monthTxs.filter(tx => isCountableExpense(tx)).forEach(tx => {
      map[tx.date] = (map[tx.date] || 0) + tx.amount;
    });
    return map;
  }, [monthTxs]);

  // Income per day (exclude credit card credits)
  const dayIncome = useMemo(() => {
    const map: Record<string, number> = {};
    monthTxs
      .filter(tx => isCountableIncome(tx, creditAccountIds))
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

  // The totals stop at today, like Home and Reports: a row dated later is not
  // earned or spent yet. Those rows still show on their day in the grid.
  const toDateTxs = useMemo(() => monthTxs.filter(tx => tx.date <= today), [monthTxs, today]);
  const scheduledCount = monthTxs.length - toDateTxs.length;
  // Spending after refunds, the same rule as Home.
  const { income: totalIncome, spending: totalExpenses } = useMemo(
    () => incomeAndSpending(toDateTxs, creditAccountIds),
    [toDateTxs, creditAccountIds]
  );

  const dayColor = (total: number) => {
    if (!total) return '';
    const ratio = total / maxDay;
    if (ratio > 0.7) return 'bg-expense';
    if (ratio > 0.4) return 'bg-warning';
    if (ratio > 0.15) return 'bg-primary';
    return 'bg-primary-soft';
  };

  if (loading) return <PageSpinner />;

  const net = totalIncome - totalExpenses;
  const legend: [string, string][] = [['bg-primary-soft', 'Low'], ['bg-primary', 'Med'], ['bg-warning', 'High'], ['bg-expense', 'Very high']];

  return (
    <div className={`${NARROW_PAGE} pb-6`}>
      <PageHeader
        title="Calendar"
        subtitle={format(current, 'MMMM yyyy')}
        actions={<>
          <IconButton onClick={() => { setCurrent(d => subMonths(d, 1)); setSelectedDay(null); }} aria-label="Previous month">
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton onClick={() => { setCurrent(d => addMonths(d, 1)); setSelectedDay(null); }} aria-label="Next month">
            <ChevronRight size={18} />
          </IconButton>
        </>}
      />

      {/* Hero: the month's net so far, money in and out as chips */}
      <HeroCard className="mb-5">
        <p className="text-sm font-medium opacity-80">Net · {format(current, 'MMMM')}</p>
        <p className="text-financial-hero mt-1">
          {hidden ? '••••••' : <BigAmount text={`${net < 0 ? '-' : '+'}${fmt(Math.abs(net))}`} />}
        </p>
        {scheduledCount > 0 && (
          <p className="text-xs opacity-70 mt-0.5">
            Totals leave out {scheduledCount} future row{scheduledCount === 1 ? '' : 's'}.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <HeroChip label="Income" value={hidden ? '••••••' : <BigAmount text={fmt(totalIncome)} />} />
          <HeroChip label="Expenses" value={hidden ? '••••••' : <BigAmount text={fmt(totalExpenses)} />} dark />
        </div>
      </HeroCard>

      {/* Month grid */}
      <div className="bg-card rounded-3xl p-3 sm:p-4 mb-5">
        <div className="grid grid-cols-7 mb-1">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="py-1.5 text-center text-[11px] font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: days.startDow }).map((_, i) => (
            <div key={`pad-${i}`} className="h-16" />
          ))}

          {days.all.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const total = dayTotals[key] || 0;
            const income = dayIncome[key] || 0;
            const isSelected = !!selectedDay && isSameDay(day, selectedDay);
            const isToday = key === today;
            return (
              <button
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                aria-pressed={isSelected}
                aria-label={format(day, 'EEEE, MMMM d')}
                className={cn(
                  'h-16 w-full max-w-[46px] mx-auto rounded-full flex flex-col items-center pt-2 gap-1 transition-colors',
                  isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                <span className={cn('text-sm leading-none tabular-nums',
                  isSelected ? 'font-semibold' : isToday ? 'font-semibold text-primary' : 'text-foreground')}>
                  {format(day, 'd')}
                </span>
                <span className="flex items-center gap-0.5 h-1.5">
                  {total > 0 && (
                    <span className={cn('w-4 h-1.5 rounded-full', isSelected ? 'bg-primary-foreground/50' : dayColor(total))} />
                  )}
                  {income > 0 && (
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', isSelected ? 'bg-primary-foreground' : 'bg-income')} />
                  )}
                </span>
                {total > 0 && !hidden && (
                  <span className={cn('text-[10px] leading-none tabular-nums', isSelected ? 'opacity-70' : 'text-muted-foreground')} title={fmt(total)}>
                    {Math.round(total).toLocaleString('en')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap mt-3 pt-3 border-t border-border px-1">
          <span>Spending</span>
          {legend.map(([cls, label]) => (
            <span key={label} className="flex items-center gap-1">
              <span className={`w-3 h-1.5 rounded-full ${cls}`} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-income" />
            Income
          </span>
        </div>
      </div>

      {/* Selected day */}
      {selectedDay && (
        <section>
          <SectionLabel label={format(selectedDay, 'EEEE, MMMM d')} count={selectedTxs.length} />
          {selectedTxs.length === 0 ? (
            <div className="bg-card rounded-3xl text-center py-8 text-muted-foreground">
              <CalendarDays size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No transactions on this day</p>
            </div>
          ) : (
            <ListCard>
              {selectedTxs.map(tx => (
                <ListRow
                  key={tx.id}
                  icon={<span className="text-[20px] flex"><AppIcon value={tx.categoryIcon} /></span>}
                  title={tx.merchant}
                  sub={tx.category}
                  value={
                    <span className={tx.type === 'income' ? 'text-income' : 'text-foreground'}>
                      {hidden ? '••••••' : <BigAmount text={`${tx.type === 'income' ? '+' : '-'}${fmt(tx.amount)}`} />}
                    </span>
                  }
                />
              ))}
            </ListCard>
          )}
        </section>
      )}
    </div>
  );
};

export default CalendarView;
