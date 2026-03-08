import { useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { getCategoryChartColor } from '@/utils/categoryColors';
import { CalendarClock, TrendingUp } from 'lucide-react';
import { parseISO, addMonths, format } from 'date-fns';

const RecurringTracker = () => {
  const { transactions } = useFinance();
  const { fmt } = useCurrency();

  const recurring = useMemo(() => transactions.filter(t => t.isRecurring), [transactions]);
  const monthlyTotal = recurring.reduce((s, t) => s + t.amount, 0);
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

  // Compute next expected date (assume monthly from last occurrence)
  const getNextDate = (lastDate: string) => {
    const next = addMonths(parseISO(lastDate), 1);
    return format(next, 'MMM d');
  };

  if (recurring.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-primary" />
          <h2 className="font-heading text-sm">Recurring Expenses</h2>
        </div>
        <span className="text-xs font-medium text-expense">{fmt(monthlyTotal)}/mo</span>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 bg-muted/50 rounded-xl p-3 mb-3">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Monthly Commitment</p>
          <p className="text-lg font-heading">{fmt(monthlyTotal)}</p>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Yearly Estimate</p>
          <p className="text-lg font-heading">{fmt(yearlyTotal)}</p>
        </div>
      </div>

      {/* Items grouped by category */}
      <div className="space-y-2">
        {byCategory.map(([cat, data], catIdx) => {
          const catColor = getCategoryChartColor(cat, catIdx);
          return (
            <div key={cat}>
              {data.items.map(item => (
                <div key={item.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                      style={{ backgroundColor: catColor + '1A', color: catColor }}>
                      {item.categoryIcon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.merchant}</p>
                      <p className="text-[11px] text-muted-foreground">Next: {getNextDate(item.date)}</p>
                    </div>
                  </div>
                  <span className="text-sm font-heading shrink-0">{fmt(item.amount)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Category breakdown */}
      {byCategory.length > 1 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2">By Category</p>
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

export default RecurringTracker;
