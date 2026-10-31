import { memo } from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import type { Budget } from '@/types/finance';
import { m, AnimatePresence } from 'framer-motion';
import AppIcon from '@/components/AppIcon';

interface Props {
  budgets: Budget[];
}

const BudgetAlertBanners = ({ budgets }: Props) => {
  const { fmt } = useCurrency();

  const alerts = budgets
    .filter(b => b.amount > 0 && b.spent > b.amount)
    .map(b => {
      const pct = Math.round((b.spent / b.amount) * 100);
      return { ...b, pct, over: true, high: true };
    })
    .sort((a, b) => b.pct - a.pct);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {alerts.map(a => (
          <m.div
            key={a.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${
              a.over
                ? 'bg-destructive-soft border border-destructive-line text-destructive'
                : a.high
                ? 'bg-warning-soft border border-warning-line text-warning-foreground'
                : 'bg-accent border border-primary-line text-accent-foreground'
            }`}
          >
            {a.over ? (
              <AlertTriangle size={16} className="shrink-0 text-destructive" />
            ) : (
              <TrendingUp size={16} className="shrink-0 text-primary" />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-medium"><AppIcon value={a.categoryIcon} /> {a.category}</span>
              <span className="ml-2 text-xs opacity-80">
                {a.over ? 'Over budget!' : `${a.pct}% used`} — {fmt(a.spent)} / {fmt(a.amount)}
              </span>
            </div>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default memo(BudgetAlertBanners);
