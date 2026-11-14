// The server-side AI call counter (supabase/functions/_shared/aiLimits.ts).
// Before it existed any signed-in user could call the model without limit.
import { describe, it, expect } from 'vitest';
import {
  AI_REQUEST_TYPES, DAILY_USER_LIMIT, DEFAULT_DAILY_CEILING, MAX_TOKENS,
  countCall, parseCeiling, refusalMessage, remainingAfter, usageDay,
  type UsageStore,
} from '../../supabase/functions/_shared/aiLimits';
import { mapAiError, OUT_OF_CREDIT_MESSAGE } from '../../supabase/functions/_shared/aiErrors';

const DAY = '2026-11-14';

/** An in-memory ai_usage table with the same compare-and-set rules as the real one. */
function fakeStore(rows: Record<string, number> = {}) {
  const calls = new Map<string, number>(Object.entries(rows));
  const key = (u: string, d: string) => `${u}|${d}`;
  const store: UsageStore = {
    async totalToday(day) {
      let sum = 0;
      for (const [k, v] of calls) if (k.endsWith(`|${day}`)) sum += v;
      return sum;
    },
    async read(u, d) { return calls.get(key(u, d)) ?? null; },
    async insertFirst(u, d) {
      if (calls.has(key(u, d))) return false;
      calls.set(key(u, d), 1);
      return true;
    },
    async bump(u, d, from) {
      if (calls.get(key(u, d)) !== from) return false;
      calls.set(key(u, d), from + 1);
      return true;
    },
  };
  return { store, get: (u: string) => calls.get(key(u, DAY)) ?? 0 };
}

describe('countCall', () => {
  it('counts the first call of the day and says 29 are left', async () => {
    const { store, get } = fakeStore();
    expect(await countCall(store, 'u1', DAY)).toEqual({ ok: true, remaining: DAILY_USER_LIMIT - 1 });
    expect(get('u1')).toBe(1);
  });

  it('allows call 30 with 0 left, and refuses call 31 without counting it', async () => {
    const { store, get } = fakeStore({ [`u1|${DAY}`]: 29 });
    expect(await countCall(store, 'u1', DAY)).toEqual({ ok: true, remaining: 0 });
    expect(await countCall(store, 'u1', DAY)).toEqual({ ok: false, reason: 'user', remaining: 0 });
    expect(get('u1')).toBe(30);
  });

  it('counts each user on their own', async () => {
    const { store } = fakeStore({ [`u1|${DAY}`]: 30 });
    expect((await countCall(store, 'u1', DAY)).ok).toBe(false);
    expect(await countCall(store, 'u2', DAY)).toEqual({ ok: true, remaining: 29 });
  });

  it('starts again on a new day', async () => {
    const { store } = fakeStore({ 'u1|2026-11-13': 30 });
    expect(await countCall(store, 'u1', DAY)).toEqual({ ok: true, remaining: 29 });
  });

  it('refuses everyone once all users together reach the ceiling', async () => {
    const { store, get } = fakeStore({ [`a|${DAY}`]: 2, [`b|${DAY}`]: 1 });
    expect(await countCall(store, 'c', DAY, 30, 3)).toEqual({ ok: false, reason: 'ceiling', remaining: 0 });
    expect(get('c')).toBe(0);
  });

  it('a ceiling of 0 turns AI off', async () => {
    const { store } = fakeStore();
    expect(await countCall(store, 'u1', DAY, 30, 0)).toEqual({ ok: false, reason: 'ceiling', remaining: 0 });
  });

  it('two requests at the same moment cannot both take the last use', async () => {
    const { store, get } = fakeStore({ [`u1|${DAY}`]: 29 });
    const results = await Promise.all([
      countCall(store, 'u1', DAY), countCall(store, 'u1', DAY), countCall(store, 'u1', DAY),
    ]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(get('u1')).toBe(30);
  });

  it('many first calls at the same moment are each counted once', async () => {
    const { store, get } = fakeStore();
    const results = await Promise.all(Array.from({ length: 4 }, () => countCall(store, 'u1', DAY)));
    expect(results.every(r => r.ok)).toBe(true);
    expect(get('u1')).toBe(4);
  });

  it('throws when the table cannot be read, so the caller refuses the request', async () => {
    const broken: UsageStore = {
      totalToday: async () => { throw new Error('PGRST205 relation "ai_usage" does not exist'); },
      read: async () => null,
      insertFirst: async () => true,
      bump: async () => true,
    };
    await expect(countCall(broken, 'u1', DAY)).rejects.toThrow(/ai_usage/);
  });

  it('throws when the write never lands, instead of letting the call through', async () => {
    const { store } = fakeStore({ [`u1|${DAY}`]: 5 });
    await expect(countCall({ ...store, bump: async () => false }, 'u1', DAY)).rejects.toThrow(/could not be recorded/);
  });
});

describe('limits and token caps', () => {
  it('the limit is 30 per user and 300 for all users', () => {
    expect(DAILY_USER_LIMIT).toBe(30);
    expect(DEFAULT_DAILY_CEILING).toBe(300);
    expect(remainingAfter(0)).toBe(30);
    expect(remainingAfter(31)).toBe(0);
  });

  it('reads the ceiling from the secret, and falls back to 300 on anything else', () => {
    expect(parseCeiling('50')).toBe(50);
    expect(parseCeiling('0')).toBe(0);
    expect(parseCeiling(undefined)).toBe(300);
    expect(parseCeiling('')).toBe(300);
    expect(parseCeiling('-5')).toBe(300);
    expect(parseCeiling('lots')).toBe(300);
  });

  it('the usage day is the UTC date', () => {
    expect(usageDay(new Date('2026-11-14T23:59:59Z'))).toBe('2026-11-14');
    // 02:00 in Dubai on the 15th is still the 14th in UTC.
    expect(usageDay(new Date('2026-11-15T02:00:00+04:00'))).toBe('2026-11-14');
  });

  it('every request type has a cap, and none is above the old 16000', () => {
    for (const type of AI_REQUEST_TYPES) {
      expect(MAX_TOKENS[type]).toBeGreaterThan(0);
      expect(MAX_TOKENS[type]).toBeLessThanOrEqual(16000);
    }
  });

  it('summaries and reports get far less than the budget analysis', () => {
    expect(MAX_TOKENS['summary']).toBeLessThanOrEqual(MAX_TOKENS['budget-advisor'] / 3);
    expect(MAX_TOKENS['monthly-report']).toBeLessThanOrEqual(MAX_TOKENS['budget-advisor'] / 3);
  });

  it('statement extraction keeps the full cap, so rows are not cut off', () => {
    expect(MAX_TOKENS['categorize-csv']).toBe(16000);
    expect(MAX_TOKENS['categorize-image']).toBe(16000);
  });

  it('the refusal says which limit was reached', () => {
    expect(refusalMessage('user')).toBe('You have used all 30 AI uses for today. The count resets at 00:00 UTC.');
    expect(refusalMessage('ceiling')).toMatch(/all users/);
  });
});

describe('mapAiError', () => {
  it('reports an empty AI account as 503 with a plain reason, not "AI service error"', () => {
    const failure = mapAiError({
      status: 400,
      type: 'invalid_request_error',
      message: '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
    });
    expect(failure).toEqual({ status: 503, error: OUT_OF_CREDIT_MESSAGE });
    expect(OUT_OF_CREDIT_MESSAGE).toBe('AI is unavailable: the AI account is out of credit.');
  });

  it('treats a 402 billing error the same way', () => {
    expect(mapAiError({ status: 402, type: 'billing_error', message: 'payment required' }).status).toBe(503);
  });

  it('keeps the generic message for other bad requests', () => {
    expect(mapAiError({ status: 400, type: 'invalid_request_error', message: 'max_tokens: must be positive' }))
      .toEqual({ status: 500, error: 'AI service error' });
    expect(mapAiError({ status: 529, type: 'overloaded_error', message: 'Overloaded' }))
      .toEqual({ status: 500, error: 'AI service error' });
  });

  it('maps a timeout, a rate limit and a bad key', () => {
    expect(mapAiError({ timeout: true }).status).toBe(504);
    expect(mapAiError({ status: 429, type: 'rate_limit_error' }).status).toBe(429);
    expect(mapAiError({ status: 401, type: 'authentication_error' }))
      .toEqual({ status: 503, error: 'AI is unavailable right now. Try again later.' });
  });
});
