import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { Budget } from '@/types/finance';
import { supabase } from '@/integrations/supabase/client';

const THRESHOLDS = [
  { pct: 100, label: 'Over budget', desc: (b: Budget) => `${b.categoryIcon} ${b.category} has exceeded its budget!` },
  { pct: 90, label: 'Almost at limit', desc: (b: Budget) => `${b.categoryIcon} ${b.category} is at ${Math.round((b.spent / b.amount) * 100)}% of budget` },
  { pct: 75, label: 'Heads up', desc: (b: Budget) => `${b.categoryIcon} ${b.category} has used 75%+ of its budget` },
];

async function sendBudgetNotification(label: string, description: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await supabase.functions.invoke('send-notification', {
      body: { subject: `SpendPal Budget Alert: ${label}`, message: description },
    });
  } catch {
    // Notification delivery failures are non-critical — swallow silently
  }
}

const STORAGE_KEY = 'spendpal-budget-alerted';
// L10: Include current month in alert keys so January's fired alerts cannot
// suppress February's. Keys also expire naturally — any key older than 2 months
// is pruned on load to prevent unbounded localStorage growth.
const CURRENT_MONTH = new Date().toISOString().slice(0, 7); // "YYYY-MM"

function loadAlerted(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const all = JSON.parse(raw) as string[];
    // Prune keys from months more than 1 month ago
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const cutoff = twoMonthsAgo.toISOString().slice(0, 7);
    const fresh = all.filter(k => {
      const monthPart = k.match(/(\d{4}-\d{2})$/)?.[1];
      return !monthPart || monthPart >= cutoff;
    });
    return new Set(fresh);
  } catch {
    return new Set();
  }
}

function saveAlerted(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage unavailable — degrade silently
  }
}

export const useBudgetAlerts = (budgets: Budget[]) => {
  const alerted = useRef<Set<string>>(loadAlerted());

  useEffect(() => {
    if (budgets.length === 0) return;

    budgets.forEach(b => {
      if (b.amount <= 0) return;
      if (b.isFixed) return; // Fixed expenses always reach 100% — alerts are noise
      const pct = (b.spent / b.amount) * 100;

      // Clear stale keys for thresholds the budget has fallen back below,
      // so the alert re-fires if spending crosses the threshold again.
      for (const threshold of THRESHOLDS) {
        if (pct < threshold.pct) {
          alerted.current.delete(`${b.id}-${threshold.pct}-${CURRENT_MONTH}`);
        }
      }

      for (const threshold of THRESHOLDS) {
        // L10: Month-namespaced key prevents cross-month alert suppression
        const key = `${b.id}-${threshold.pct}-${CURRENT_MONTH}`;
        if (pct >= threshold.pct && !alerted.current.has(key)) {
          alerted.current.add(key);
          saveAlerted(alerted.current);
          const description = threshold.desc(b);
          toast(threshold.label, { description, duration: 5000 });
          sendBudgetNotification(threshold.label, description);
          break; // only show highest threshold
        }
      }
    });

    saveAlerted(alerted.current);
  }, [budgets]);
};
