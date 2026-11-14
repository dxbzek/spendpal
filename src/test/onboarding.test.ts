import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FALLBACK_CURRENCY, NEW_USER_DAYS, checklistSteps, needsCurrencyStep, regionOfLocale,
  saveProfileCurrency, showChecklist, suggestedCurrency, currencyConfirmedKey, checklistDismissedKey,
} from '@/lib/onboarding';

const none = { accounts: 0, transactions: 0, budgets: 0, goals: 0 };

describe('suggestedCurrency', () => {
  it('reads the country from the browser locale', () => {
    expect(suggestedCurrency(['en-GB'])).toBe('GBP');
    expect(suggestedCurrency(['en-PH'])).toBe('PHP');
    expect(suggestedCurrency(['ar-AE'])).toBe('AED');
    expect(suggestedCurrency(['en-IN'])).toBe('INR');
    expect(suggestedCurrency(['de-CH'])).toBe('CHF');
  });

  it('knows countries that share a currency', () => {
    expect(suggestedCurrency(['fr-FR'])).toBe('EUR');
    expect(suggestedCurrency(['es-ES'])).toBe('EUR');
    expect(suggestedCurrency(['nl-BE'])).toBe('EUR');
    expect(suggestedCurrency(['en-IE'])).toBe('EUR');
    expect(suggestedCurrency(['fr-CI'])).toBe('XOF');
  });

  it('prefers a locale with a country over a bare language', () => {
    expect(suggestedCurrency(['en', 'en-AU'])).toBe('AUD');
  });

  it('falls back to USD when nothing names a known country', () => {
    expect(suggestedCurrency([])).toBe(FALLBACK_CURRENCY);
    expect(suggestedCurrency(['xx-QQ'])).toBe('USD');
    expect(FALLBACK_CURRENCY).toBe('USD');
  });

  it('no longer starts everyone in AED', () => {
    expect(suggestedCurrency(['en-US'])).not.toBe('AED');
  });

  it('reads the region of a tag, or the likely one of a bare language', () => {
    expect(regionOfLocale('pt-BR')).toBe('BR');
    expect(regionOfLocale('en')).toBe('US');
    expect(regionOfLocale('zh-Hant-TW')).toBe('TW');
  });
});

describe('needsCurrencyStep', () => {
  it('asks a brand-new user', () => {
    expect(needsCurrencyStep(none, false)).toBe(true);
  });

  it('never asks someone who already has an account or any record', () => {
    expect(needsCurrencyStep({ ...none, accounts: 3 }, false)).toBe(false);
    expect(needsCurrencyStep({ ...none, transactions: 1 }, false)).toBe(false);
    expect(needsCurrencyStep({ ...none, budgets: 1 }, false)).toBe(false);
    expect(needsCurrencyStep({ ...none, goals: 1 }, false)).toBe(false);
  });

  it('asks once', () => {
    expect(needsCurrencyStep(none, true)).toBe(false);
  });
});

describe('getting-started checklist', () => {
  it('marks each step from the data', () => {
    const steps = checklistSteps({ accounts: 1, transactions: 4, budgets: 0, goals: 0 });
    expect(steps.map(s => [s.id, s.done])).toEqual([['account', true], ['transaction', true], ['budget', false], ['goal', false]]);
  });

  it('stays after the first account, until every step is done', () => {
    const today = '2026-11-14';
    expect(showChecklist(checklistSteps({ ...none, accounts: 1 }), false, null, today)).toBe(true);
    expect(showChecklist(checklistSteps({ accounts: 1, transactions: 1, budgets: 1, goals: 1 }), false, '2026-11-10', today)).toBe(false);
  });

  it('goes when dismissed', () => {
    expect(showChecklist(checklistSteps({ ...none, accounts: 1 }), true, null, '2026-11-14')).toBe(false);
  });

  it('is not shown to a user with months of history', () => {
    const steps = checklistSteps({ accounts: 2, transactions: 500, budgets: 5, goals: 0 });
    expect(showChecklist(steps, false, '2026-03-01', '2026-11-14')).toBe(false);
    expect(showChecklist(steps, false, '2026-11-01', '2026-11-14')).toBe(true);
    expect(NEW_USER_DAYS).toBe(30);
  });

  it('keeps flags per user', () => {
    expect(currencyConfirmedKey('u1')).not.toBe(currencyConfirmedKey('u2'));
    expect(checklistDismissedKey('u1')).toContain('u1');
  });
});

describe('saveProfileCurrency', () => {
  const client = (answer: { data: unknown; error: unknown }) => {
    const calls: unknown[] = [];
    const chain = {
      update: vi.fn((v: unknown) => { calls.push(['update', v]); return chain; }),
      eq: vi.fn((c: string, v: unknown) => { calls.push(['eq', c, v]); return chain; }),
      select: vi.fn(() => Promise.resolve(answer)),
    };
    return { db: { from: vi.fn(() => chain) } as unknown as SupabaseClient, calls };
  };

  it('writes the currency to the user\'s own profile row', async () => {
    const { db, calls } = client({ data: [{ user_id: 'u1' }], error: null });
    expect(await saveProfileCurrency(db, 'u1', 'GBP')).toBe(true);
    expect(calls).toEqual([['update', { currency: 'GBP' }], ['eq', 'user_id', 'u1']]);
  });

  it('reports failure when the database refuses or no row was updated', async () => {
    expect(await saveProfileCurrency(client({ data: null, error: { message: 'x' } }).db, 'u1', 'GBP')).toBe(false);
    expect(await saveProfileCurrency(client({ data: [], error: null }).db, 'u1', 'GBP')).toBe(false);
  });

  it('refuses a code SpendPal does not offer', async () => {
    const { db, calls } = client({ data: [{}], error: null });
    expect(await saveProfileCurrency(db, 'u1', 'ZZZ')).toBe(false);
    expect(calls).toEqual([]);
  });
});
