// Budget alert emails: when they are offered and what is sent for one.

/**
 * Whether the app offers email alerts. An alert email needs a sender address
 * on a domain the mail provider has verified, and there is none yet, so the
 * switch is hidden until one exists. The owner turns this on with
 * VITE_EMAIL_ALERTS=on in the build, after the send-notification function has
 * its RESEND_API_KEY and ALERT_FROM_EMAIL secrets.
 */
export function emailAlertsEnabled(flag: unknown): boolean {
  return flag === 'on';
}

export const EMAIL_ALERTS_ENABLED = emailAlertsEnabled(import.meta.env.VITE_EMAIL_ALERTS);

/** The share of a budget at which an alert is sent, highest first. */
export const ALERT_THRESHOLDS = [100, 90, 75] as const;
export type AlertThreshold = typeof ALERT_THRESHOLDS[number];

/**
 * The highest threshold a budget has reached, or null below 75%.
 * A budget with no amount has no percentage and never alerts.
 */
export function reachedThreshold(spent: number, amount: number): AlertThreshold | null {
  if (!(amount > 0)) return null;
  const pct = (spent / amount) * 100;
  return ALERT_THRESHOLDS.find(t => pct >= t) ?? null;
}

/**
 * What the app sends to the send-notification function. Only the budget and
 * the threshold: the server writes the subject and the text itself, from the
 * user's own budget row, so the function cannot be used to mail free text.
 */
export function alertRequestBody(budgetId: string, threshold: AlertThreshold): { budget_id: string; threshold: AlertThreshold } {
  return { budget_id: budgetId, threshold };
}
