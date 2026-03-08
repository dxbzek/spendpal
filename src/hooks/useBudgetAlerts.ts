import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { Budget } from '@/types/finance';

const THRESHOLDS = [
  { pct: 100, label: '🚨 Over budget', desc: (b: Budget) => `${b.categoryIcon} ${b.category} has exceeded its budget!` },
  { pct: 90, label: '⚠️ Almost at limit', desc: (b: Budget) => `${b.categoryIcon} ${b.category} is at ${Math.round((b.spent / b.amount) * 100)}% of budget` },
  { pct: 75, label: '📊 Heads up', desc: (b: Budget) => `${b.categoryIcon} ${b.category} has used 75%+ of its budget` },
];

export const useBudgetAlerts = (budgets: Budget[]) => {
  const alerted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (budgets.length === 0) return;

    budgets.forEach(b => {
      if (b.amount <= 0) return;
      const pct = (b.spent / b.amount) * 100;

      for (const threshold of THRESHOLDS) {
        const key = `${b.id}-${threshold.pct}`;
        if (pct >= threshold.pct && !alerted.current.has(key)) {
          alerted.current.add(key);
          toast(threshold.label, { description: threshold.desc(b), duration: 5000 });
          break; // only show highest threshold
        }
      }
    });
  }, [budgets]);
};
