// Budget alert emails: the server-built text, the request the app sends, and
// the thresholds. The function used to mail any subject and message the caller sent.
import { describe, it, expect } from 'vitest';
import {
  EMAIL_PER_DAY, buildBudgetAlert, cleanCategory, formatBudgetAmount, isAlertThreshold, isUuid,
} from '../../supabase/functions/_shared/budgetAlert';
import { alertRequestBody, emailAlertsEnabled, reachedThreshold } from '@/lib/notifications';

describe('buildBudgetAlert', () => {
  it('writes the 75% alert from the budget row', () => {
    const email = buildBudgetAlert({ category: 'Groceries', amount: 1200, currency: 'AED', threshold: 75 });
    expect(email.subject).toBe('SpendPal budget alert: Groceries budget at 75%');
    expect(email.text).toContain('Your Groceries budget of AED 1,200 has reached 75% of its limit.');
  });

  it('writes the 100% alert as used up', () => {
    const email = buildBudgetAlert({ category: 'Dining', amount: 800.5, currency: 'aed', threshold: 100 });
    expect(email.subject).toBe('SpendPal budget alert: Dining budget is used up');
    expect(email.text).toContain('Your Dining budget of AED 800.5 is used up.');
  });

  it('links to the settings page of the real site, not to spendpal.app', () => {
    const email = buildBudgetAlert({ category: 'Rent', amount: 5000, currency: 'AED', threshold: 90 });
    expect(email.html).toContain('href="https://spendpal.vercel.app/settings"');
    expect(email.text).toContain('https://spendpal.vercel.app/settings');
    expect(email.html + email.text).not.toContain('spendpal.app');
  });

  it('uses the SITE_URL secret when there is one', () => {
    const email = buildBudgetAlert({ category: 'Rent', amount: 5000, currency: 'AED', threshold: 90, siteUrl: 'https://example.com/' });
    expect(email.html).toContain('href="https://example.com/settings"');
  });

  it('cannot carry a link or markup that was typed as a category name', () => {
    const email = buildBudgetAlert({
      category: 'Claim your refund at http://evil.example/pay <a href="x">now</a>',
      amount: 1, currency: 'AED', threshold: 100,
    });
    const all = email.subject + email.text + email.html;
    expect(all).not.toContain('http://evil');
    expect(all).not.toContain('evil.example');
    expect(all).not.toContain('<a href="x"');
  });
});

describe('cleanCategory', () => {
  it('keeps ordinary names as they are', () => {
    expect(cleanCategory('Metro/Taxi')).toBe('Metro/Taxi');
    expect(cleanCategory("Kids' school & books")).toBe("Kids' school & books");
    expect(cleanCategory('Café – غذاء 2')).toBe('Café غذاء 2');
  });

  it('removes dots, colons and angle brackets, and cuts at 40 characters', () => {
    expect(cleanCategory('www.evil.com: <b>pay</b>')).toBe('www evil com b pay /b');
    expect(cleanCategory('x'.repeat(100))).toHaveLength(40);
  });

  it('has a fallback for an empty or missing name', () => {
    expect(cleanCategory('...')).toBe('unnamed');
    expect(cleanCategory(null)).toBe('unnamed');
  });
});

describe('formatBudgetAmount', () => {
  it('formats with the currency code', () => {
    expect(formatBudgetAmount(20000, 'AED')).toBe('AED 20,000');
    expect(formatBudgetAmount(1234.567, 'usd')).toBe('USD 1,234.57');
  });

  it('leaves out a currency that is not a three-letter code', () => {
    expect(formatBudgetAmount(50, '<b>')).toBe('50');
    expect(formatBudgetAmount(50, null)).toBe('50');
  });
});

describe('request checks', () => {
  it('accepts only the three thresholds', () => {
    expect(isAlertThreshold(75)).toBe(true);
    expect(isAlertThreshold(90)).toBe(true);
    expect(isAlertThreshold(100)).toBe(true);
    expect(isAlertThreshold(50)).toBe(false);
    expect(isAlertThreshold('100')).toBe(false);
  });

  it('accepts only a uuid as the budget id', () => {
    expect(isUuid('3f2b1c9e-8a47-4d5e-9b1a-0c2d3e4f5a6b')).toBe(true);
    expect(isUuid('1 or 1=1')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it('limits a user to 10 alert emails a day', () => {
    expect(EMAIL_PER_DAY).toBe(10);
  });
});

describe('what the app sends', () => {
  it('sends the budget id and the threshold, and no text', () => {
    expect(alertRequestBody('3f2b1c9e-8a47-4d5e-9b1a-0c2d3e4f5a6b', 90)).toEqual({
      budget_id: '3f2b1c9e-8a47-4d5e-9b1a-0c2d3e4f5a6b',
      threshold: 90,
    });
  });

  it('picks the highest threshold a budget has reached', () => {
    expect(reachedThreshold(740, 1000)).toBeNull();
    expect(reachedThreshold(750, 1000)).toBe(75);
    expect(reachedThreshold(899, 1000)).toBe(75);
    expect(reachedThreshold(900, 1000)).toBe(90);
    expect(reachedThreshold(1000, 1000)).toBe(100);
    expect(reachedThreshold(2500, 1000)).toBe(100);
  });

  it('never alerts on a budget with no amount', () => {
    expect(reachedThreshold(100, 0)).toBeNull();
    expect(reachedThreshold(100, NaN)).toBeNull();
  });

  it('offers email alerts only when the build turns them on', () => {
    expect(emailAlertsEnabled('on')).toBe(true);
    expect(emailAlertsEnabled(undefined)).toBe(false);
    expect(emailAlertsEnabled('true')).toBe(false);
  });
});
