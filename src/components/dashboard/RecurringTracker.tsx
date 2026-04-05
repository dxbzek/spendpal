import { memo, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { getCategoryChartColor } from '@/utils/categoryColors';
import { CalendarClock } from 'lucide-react';
import { parseISO, addMonths, format } from 'date-fns';
import { motion } from 'framer-motion';

const RecurringTracker = () => {
  const { transactions } = useFinance();
  const { fmt } = useCurrency();

  const recurring = useMemo(() => transactions.filter(t => t.isRecurring && t.type === 'expense'), [transactions]);
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
      <div className="space-y-1">
        {byCategory.map(([cat, data], catIdx) => {
          const catColor = getCategoryChartColor(cat, catIdx);
          // Use category + first item id for uniqueness — category name alone is not
          // guaranteed unique when users have custom categories with duplicate names.
          const catKey = `${cat}-${data.items[0]?.id ?? catIdx}`;
          return (
            <div key={catKey}>
              {data.items.map(item => {
                const hasInstallments = item.totalInstallments && item.currentInstallment;
                const paidPct = hasInstallments
                  ? Math.round((item.currentInstallment! / item.totalInstallments!) * 100)
                  : null;
                const remainingInstallments = hasInstallments
                  ? Math.max(0, item.totalInstallments! - item.currentInstallment!)
                  : null;
                const remaining = remainingInstallments !== null
                  ? remainingInstallments * item.amount
                  : null;

                return (
                  <div key={item.id} className="py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl shrink-0">{item.categoryIcon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.merchant}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] text-muted-foreground">Next: {getNextDate(item.date)}</p>
                            {hasInstallments && (
                              <span className="text-[11px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                {item.currentInstallment}/{item.totalInstallments}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-heading">{fmt(item.amount)}</span>
                        {hasInstallments && (
                          <p className="text-[10px] text-muted-foreground">{fmt(remaining!)} left ({remainingInstallments} mo)</p>
                        )}
                      </div>
                    </div>

                    {/* Installment progress bar */}
                    {hasInstallments && (
                      <div className="mt-1.5 ml-11">
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${paidPct}%` }}
                            transition={{ duration: 0.6 }}
                            className="h-full rounded-full bg-primary"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{paidPct}% paid</p>
                      </div>
                    )}
                  </div>
                );
              })}
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

export default memo(RecurringTracker);
