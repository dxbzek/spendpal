// Builds the budget alert email on the server, from the user's own budget row.
// The caller sends only a budget id and a threshold, never text.
// This file has no Deno or npm imports, so the app's unit tests can load it.

export const ALERT_THRESHOLDS = [75, 90, 100] as const;
export type AlertThreshold = typeof ALERT_THRESHOLDS[number];

/** Alert emails one user may get in 24 hours. */
export const EMAIL_PER_DAY = 10;

export const DEFAULT_SITE_URL = "https://spendpal.vercel.app";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isAlertThreshold(v: unknown): v is AlertThreshold {
  return typeof v === "number" && (ALERT_THRESHOLDS as readonly number[]).includes(v);
}

/** HTML-escape a value before it goes into the email body. */
export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );

/**
 * A category name is free text the user typed, and the email address is not
 * confirmed, so the name could be written to mislead a stranger. Keep letters,
 * digits, spaces and & ' - / only (no dots or colons, so no links), 40
 * characters at most.
 */
export function cleanCategory(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const cleaned = s.replace(/[^\p{L}\p{N} &'\-/]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40).trim();
  return cleaned || "unnamed";
}

/** "AED 1,200" or "AED 1,200.50". No currency code when it is not three letters. */
export function formatBudgetAmount(amount: number, currency: unknown): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const text = n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency)
    ? `${currency.toUpperCase()} ${text}`
    : text;
}

export interface BudgetAlertInput {
  category: unknown;
  amount: number;
  currency: unknown;
  threshold: AlertThreshold;
  siteUrl?: string;
}

export interface BudgetAlertEmail {
  subject: string;
  text: string;
  html: string;
}

export function buildBudgetAlert(input: BudgetAlertInput): BudgetAlertEmail {
  const category = cleanCategory(input.category);
  const amount = formatBudgetAmount(input.amount, input.currency);
  const settingsUrl = `${(input.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "")}/settings`;

  const subject = input.threshold === 100
    ? `SpendPal budget alert: ${category} budget is used up`
    : `SpendPal budget alert: ${category} budget at ${input.threshold}%`;
  const line = input.threshold === 100
    ? `Your ${category} budget of ${amount} is used up.`
    : `Your ${category} budget of ${amount} has reached ${input.threshold}% of its limit.`;
  const why = "You get this email because email budget alerts are on in your SpendPal settings.";

  return {
    subject,
    text: `${line}\n\n${why}\nChange this in Settings: ${settingsUrl}`,
    html: `<p style="font-family:sans-serif;font-size:15px;color:#222">${escapeHtml(line)}</p>
<p style="font-family:sans-serif;font-size:12px;color:#888;margin-top:24px">${escapeHtml(why)}<br>
<a href="${escapeHtml(settingsUrl)}">Change notification settings</a></p>`,
  };
}
