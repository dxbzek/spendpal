import { memo, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { getCategoryChartColor } from '@/utils/categoryColors';
import { CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import { IconTile } from '@/components/AppIcon';
import { activeRecurring, monthlyRecurringTotal, nextDueDate } from '@/lib/finance/recurringBills';

const RecurringTracker = () => {
  const { transactions } = useFinance();
  const { fmt } = useCurrency();

  // One entry per running bill, at its latest amount. Summing every logged
  // row made "Monthly Commitment" grow each month the same bill was logged.
  // Instalment plans are on the Installments page, not here.
  const recurring = useMemo(() => activeRecurring(transactions, new Date()), [transactions]);
  const monthlyTotal = monthlyRecurringTotal(recurring);
  const yearlyTotal = monthlyTotal * 12;

  // Group by category for breakdown
  const byCategory = useMemo(() => {
    const map: Record<string, { icon: string; total: number; items: typeof recurring }> = {};
    recurring.forEach(r => {
      if (!map[r.category]) map[r.category] = { icon: r.categoryIcon, total: 0, items: [] };
      map[r.category].total += r.amount;
      map[r.category].items.push(r);
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [recurring]);

  // The next date the bill falls on, today or later (not just last date + 1 month).
  const getNextDate = (lastDate: string) => {
    const next = nextDueDate(lastDate, new Date());
    return next ? format(next, 'MMM d') : '';
  };

  if (recurring.length === 0) return null;

  return (
    <div className="bg-card rounded-xl p-4 card-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-primary" />
          <h2 className="font-heading text-sm">Recurring</h2>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 bg-muted rounded-xl p-3 mb-3">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Monthly</p>
          <p className="text-lg font-heading">{fmt(monthlyTotal)}</p>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Yearly</p>
          <p className="text-lg font-heading">{fmt(yearlyTotal)}</p>
        </div>
      </div>

      {/* Items grouped by category */}
      <div className="space-y-1">
        {byCategory.map(([cat, data], catIdx) => {
          // Use category + first item id for uniqueness - category name alone is not
          // guaranteed unique when users have custom categories with duplicate names.
          const catKey = `${cat}-${data.items[0]?.id ?? catIdx}`;
          return (
            <div key={catKey}>
              {data.items.map(item => (
                <div key={item.id} className="py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <IconTile value={item.categoryIcon} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.merchant || item.category}</p>
                        <p className="text-xs text-muted-foreground">Next: {getNextDate(item.date)}</p>
                      </div>
                    </div>
                    <span className="text-sm font-heading shrink-0">{fmt(item.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Category breakdown */}
      {byCategory.length > 1 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">By category</p>
          <div className="flex gap-2 flex-wrap">
            {byCategory.map(([cat, data], i) => {
              const color = getCategoryChartColor(cat, i);
              const pct = monthlyTotal ? Math.round((data.total / monthlyTotal) * 100) : 0;
              return (
                <span key={cat} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-muted">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  {cat} {pct}%
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(RecurringTracker);
