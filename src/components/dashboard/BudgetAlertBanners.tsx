import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import type { Budget } from '@/types/finance';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  budgets: Budget[];
}

const BudgetAlertBanners = ({ budgets }: Props) => {
  const { fmt } = useCurrency();

  const alerts = budgets
    .filter(b => b.amount > 0 && (b.spent / b.amount) >= 0.75)
    .map(b => {
      const pct = Math.round((b.spent / b.amount) * 100);
      const over = pct >= 100;
      const high = pct >= 90;
      return { ...b, pct, over, high };
    })
    .sort((a, b) => b.pct - a.pct);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {alerts.map(a => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${
              a.over
                ? 'bg-destructive/10 border border-destructive/20 text-destructive'
                : a.high
                ? 'bg-warning/10 border border-warning/20 text-warning-foreground'
                : 'bg-accent border border-primary/10 text-accent-foreground'
            }`}
          >
            {a.over ? (
              <AlertTriangle size={16} className="shrink-0 text-destructive" />
            ) : (
              <TrendingUp size={16} className="shrink-0 text-primary" />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-medium">{a.categoryIcon} {a.category}</span>
              <span className="ml-2 text-xs opacity-80">
                {a.over ? 'Over budget!' : `${a.pct}% used`} — {fmt(a.spent)} / {fmt(a.amount)}
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default BudgetAlertBanners;
