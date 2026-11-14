import { useEffect, useRef } from 'react';
import { useSettingsUserId } from '@/hooks/useUserSettings';
import { browserStorage, readUserItem, writeUserItem } from '@/lib/userStorage';
import { format, subMonths } from 'date-fns';
import type { Budget } from '@/types/finance';
import { supabase } from '@/integrations/supabase/client';
import {
  ALERT_THRESHOLDS, EMAIL_ALERTS_ENABLED, alertRequestBody, reachedThreshold,
  type AlertThreshold,
} from '@/lib/notifications';

// Ask the server to email one budget alert. The server decides whether the
// user wants email, builds the text from the budget row, and limits how many
// are sent per day.
async function sendBudgetNotification(budgetId: string, threshold: AlertThreshold) {
  // No verified sender address yet: the server could not deliver, so don't ask.
  if (!EMAIL_ALERTS_ENABLED) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await supabase.functions.invoke('send-notification', {
      body: alertRequestBody(budgetId, threshold),
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    // Notification delivery failures are non-critical - swallow silently
  }
}

// Kept per user on this device, under the user's own key. The list under the
// old fixed name moves to the first user who loads it.
const NAME = 'budget_alerted';
const LEGACY_KEY = 'spendpal-budget-alerted';
// Include current month in alert keys so January's fired alerts cannot
// suppress February's. Keys also expire naturally - any key older than 2 months
// is pruned on load to prevent unbounded localStorage growth.
const CURRENT_MONTH = format(new Date(), 'yyyy-MM');

function loadAlerted(userId: string | null): Set<string> {
  if (!userId) return new Set();
  try {
    const raw = readUserItem(browserStorage(), userId, NAME, LEGACY_KEY);
    if (!raw) return new Set();
    const all = JSON.parse(raw) as string[];
    // Prune keys from months more than 1 month ago
    const cutoff = format(subMonths(new Date(), 2), 'yyyy-MM');
    const fresh = all.filter(k => {
      const monthPart = k.match(/(\d{4}-\d{2})$/)?.[1];
      return !monthPart || monthPart >= cutoff;
    });
    return new Set(fresh);
  } catch {
    return new Set();
  }
}

function saveAlerted(userId: string, set: Set<string>) {
  let arr = [...set];
  // Hard cap: keep only the 200 most recently added keys to bound storage size
  if (arr.length > 200) arr = arr.slice(arr.length - 200);
  writeUserItem(browserStorage(), userId, NAME, JSON.stringify(arr));
}

export const useBudgetAlerts = (budgets: Budget[]) => {
  const userId = useSettingsUserId();
  const store = useRef<{ userId: string | null; keys: Set<string> } | null>(null);

  useEffect(() => {
    if (budgets.length === 0 || !userId) return;
    if (store.current?.userId !== userId) store.current = { userId, keys: loadAlerted(userId) };
    const alerted = { current: store.current.keys };

    // Month-namespaced key prevents cross-month alert suppression
    const keyOf = (b: Budget, threshold: AlertThreshold) => `${b.id}-${threshold}-${CURRENT_MONTH}`;

    budgets.forEach(b => {
      if (b.amount <= 0) return;
      if (b.isFixed) return; // Fixed expenses always reach 100% - alerts are noise
      const pct = (b.spent / b.amount) * 100;

      // Clear stale keys for thresholds the budget has fallen back below,
      // so the alert re-fires if spending crosses the threshold again.
      for (const threshold of ALERT_THRESHOLDS) {
        if (pct < threshold) alerted.current.delete(keyOf(b, threshold));
      }

      const top = reachedThreshold(b.spent, b.amount);
      if (top === null || alerted.current.has(keyOf(b, top))) return;

      // One alert for the highest threshold reached. The lower ones are marked
      // as done too: a budget that jumps straight to 100% must not send
      // "reached 90%" and "reached 75%" on the next two loads.
      for (const threshold of ALERT_THRESHOLDS) {
        if (threshold <= top) alerted.current.add(keyOf(b, threshold));
      }
      // In-app toast pop-ups were removed by request - they fired one per
      // budget on every dashboard load, which felt spammy. The alert is an
      // opt-in email, sent only while the app is open.
      sendBudgetNotification(b.id, top);
    });

    saveAlerted(userId, alerted.current);
  }, [budgets, userId]);
};
