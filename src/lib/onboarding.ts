// First use: which currency to suggest, when to ask for it, and the
// getting-started checklist on Home. Pure, so it's unit-tested; the screens
// only read and write the flags.
import type { SupabaseClient } from '@supabase/supabase-js';
import { CURRENCY_MAP } from '@/utils/currencies';

/** When the browser gives no country, or the country's currency is not in the list. */
export const FALLBACK_CURRENCY = 'USD';

// Countries whose currency is shared, so CURRENCY_MAP (one country per
// currency) cannot name them.
const SHARED: Record<string, string[]> = {
  EUR: ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
    'AD', 'MC', 'SM', 'VA', 'ME', 'XK'],
  USD: ['US', 'EC', 'SV', 'PA', 'PR', 'TL', 'ZW', 'FM', 'MH', 'PW', 'GU', 'AS', 'VI', 'TC', 'VG', 'BQ'],
  AUD: ['AU', 'KI', 'NR', 'TV'],
  NZD: ['NZ', 'CK', 'NU', 'PN', 'TK'],
  CHF: ['CH', 'LI'],
  INR: ['IN'],
  XOF: ['BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG'],
  XAF: ['CM', 'CF', 'TD', 'CG', 'GQ', 'GA'],
  XCD: ['AG', 'DM', 'GD', 'KN', 'LC', 'VC', 'AI', 'MS'],
  DKK: ['DK', 'FO', 'GL'],
  NOK: ['NO', 'SJ'],
  GBP: ['GB', 'IM', 'JE', 'GG'],
  ZAR: ['ZA'],
  MAD: ['MA', 'EH'],
  ILS: ['IL', 'PS'],
};

/** Country code (ISO 3166, upper case) to currency code, for the currencies SpendPal offers. */
export const REGION_CURRENCY: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [code, { locale }] of Object.entries(CURRENCY_MAP)) {
    const region = locale.split('-').pop()?.toUpperCase();
    if (region && region.length === 2 && !out[region]) out[region] = code;
  }
  for (const [code, regions] of Object.entries(SHARED)) {
    if (!CURRENCY_MAP[code]) continue;
    for (const r of regions) out[r] = code;
  }
  return out;
})();

/** The country in a locale tag ("en-GB" gives "GB"); "en" alone gives the likely one ("US"). */
export function regionOfLocale(locale: string): string | null {
  try {
    const loc = new Intl.Locale(locale);
    const region = loc.region ?? loc.maximize().region;
    return region && /^[A-Z]{2}$/.test(region) ? region : null;
  } catch {
    const m = locale.match(/[-_]([A-Za-z]{2})(?:[-_]|$)/);
    return m ? m[1].toUpperCase() : null;
  }
}

/**
 * The currency to preselect, from the browser's locales in order of
 * preference. A locale with a country wins over one without ("en" says
 * nothing about where the user is). USD when nothing matches.
 */
export function suggestedCurrency(locales: readonly string[]): string {
  const withRegion = locales.filter(l => /[-_][A-Za-z]{2}(?:[-_]|$)/.test(l));
  for (const l of [...withRegion, ...locales]) {
    const region = regionOfLocale(l);
    const code = region ? REGION_CURRENCY[region] : undefined;
    if (code) return code;
  }
  return FALLBACK_CURRENCY;
}

/** The browser's locales, most preferred first. */
export function browserLocales(): string[] {
  const out: string[] = [];
  try {
    if (typeof navigator !== 'undefined') out.push(...(navigator.languages ?? []), navigator.language);
  } catch { /* no navigator */ }
  try { out.push(Intl.NumberFormat().resolvedOptions().locale); } catch { /* no Intl */ }
  return out.filter((l): l is string => typeof l === 'string' && l.length > 0);
}

interface Counts {
  accounts: number;
  transactions: number;
  budgets: number;
  goals: number;
}

/**
 * Ask for a currency only on a truly empty account: anyone with an account
 * or a record already has amounts saved in some currency, and changing it
 * there needs Settings' convert-or-relabel step, not this one.
 */
export function needsCurrencyStep(counts: Counts, confirmed: boolean): boolean {
  if (confirmed) return false;
  return counts.accounts === 0 && counts.transactions === 0 && counts.budgets === 0 && counts.goals === 0;
}

export type ChecklistStepId = 'account' | 'transaction' | 'budget' | 'goal';

export interface ChecklistStep {
  id: ChecklistStepId;
  label: string;
  hint: string;
  done: boolean;
}

export function checklistSteps(counts: Counts): ChecklistStep[] {
  return [
    { id: 'account', label: 'Add your first account', hint: 'Cash, bank account or credit card', done: counts.accounts > 0 },
    { id: 'transaction', label: 'Record a transaction', hint: 'Income or expense', done: counts.transactions > 0 },
    { id: 'budget', label: 'Create a budget', hint: 'A monthly limit for a category', done: counts.budgets > 0 },
    { id: 'goal', label: 'Set a savings goal', hint: 'Something to work toward', done: counts.goals > 0 },
  ];
}

/** Rows older than this mean the user is past getting started. */
export const NEW_USER_DAYS = 30;

/**
 * Show the checklist on Home until every step is done or it is dismissed,
 * and only to a new user: someone whose oldest row is less than
 * NEW_USER_DAYS old. A user with months of history who never set a goal is
 * not shown a getting-started card.
 */
export function showChecklist(
  steps: readonly ChecklistStep[],
  dismissed: boolean,
  oldestTransactionDate: string | null,
  today: string,
): boolean {
  if (dismissed || steps.every(s => s.done)) return false;
  if (!oldestTransactionDate) return true;
  const age = (Date.parse(today) - Date.parse(oldestTransactionDate)) / 86_400_000;
  return !(age >= NEW_USER_DAYS);
}

// Per user and per browser. localStorage until settings move to the
// database; the key has the user id so two people on one browser don't share it.
export const currencyConfirmedKey = (userId: string) => `spendpal_currency_confirmed_${userId}`;
export const checklistDismissedKey = (userId: string) => `spendpal_checklist_dismissed_${userId}`;

export function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

export function writeFlag(key: string): void {
  try { localStorage.setItem(key, '1'); } catch { /* storage blocked: the step shows again next time */ }
}

/**
 * Save the currency on the profile. True only when the row was updated: the
 * first account is created in this currency, so the screen must not move on
 * if the save failed.
 */
export async function saveProfileCurrency(client: SupabaseClient, userId: string, code: string): Promise<boolean> {
  if (!CURRENCY_MAP[code]) return false;
  const { data, error } = await client.from('profiles').update({ currency: code }).eq('user_id', userId).select('user_id');
  return !error && Array.isArray(data) && data.length === 1;
}

/** Router state that asks Budgets or Goals to open its Add dialog on arrival. */
export const OPEN_ADD_STATE = { openAdd: true } as const;

export function wantsAddDialog(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { openAdd?: unknown }).openAdd === true;
}
