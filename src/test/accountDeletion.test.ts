// Delete Everything must leave no personal data behind, and Delete my account
// must never claim a deletion that did not happen (or miss one that did).
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteEverything, deleteAccount, clearLocalData } from '@/lib/accountDeletion';
import { userKey } from '@/lib/userStorage';

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };

/**
 * The avatar storage policies as they may stand on the live project:
 * 'applied': the review-fixes migration is in, a user sees and deletes their own folder.
 * 'missing': no SELECT and no DELETE policy: the list is empty and a remove deletes nothing, without an error.
 * 'no-delete': the file can be seen, but a remove still answers ok and deletes nothing.
 */
type AvatarPolicy = 'applied' | 'missing' | 'no-delete';

/** In-memory stand-in for the Supabase client: just the calls accountDeletion.ts makes. */
function fakeDb(seed: Record<string, Row[]>, errors: Record<string, DbError> = {}, policy: AvatarPolicy = 'applied') {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const calls: string[] = [];
  const files = new Set([`${ME}/avatar.png`, `${OTHER}/avatar.png`]);
  const from = (name: string) => {
    const filters: Array<[string, unknown]> = [];
    let op: 'delete' | 'update' | 'select' = 'delete';
    let patch: Row = {};
    let single = false;
    const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
    const run = () => {
      calls.push(`${op} ${name}`);
      if (errors[name]) return { data: null, error: errors[name] };
      // A table the database does not have answers like PostgREST does.
      if (!(name in tables)) return { data: null, error: { message: `Could not find the table 'public.${name}'`, code: 'PGRST205' } };
      if (op === 'select') {
        const rows = tables[name].filter(match);
        return { data: single ? rows[0] ?? null : rows, error: null };
      }
      if (op === 'delete') tables[name] = tables[name].filter(r => !match(r));
      else tables[name].filter(match).forEach(r => Object.assign(r, patch));
      return { data: null, error: null };
    };
    const q = {
      select: () => { op = 'select'; return q; },
      delete: () => { op = 'delete'; return q; },
      update: (p: Row) => { op = 'update'; patch = p; return q; },
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      maybeSingle: () => { single = true; return q; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  // The signed-in user is ME; policies only ever cover their own folder.
  const own = (path: string) => path.startsWith(`${ME}/`);
  const storage = {
    from: (bucket: string) => {
      expect(bucket).toBe('avatars');
      return {
        list: async (folder: string) => ({
          data: policy === 'missing' ? [] : [...files]
            .filter(p => p.startsWith(`${folder}/`) && own(p))
            .map(p => ({ name: p.slice(folder.length + 1), id: `id-${p}` })),
          error: null,
        }),
        remove: async (paths: string[]) => {
          calls.push(`remove ${paths.join(',')}`);
          if (policy === 'applied') for (const p of paths) if (own(p)) files.delete(p);
          return { data: [], error: null };
        },
      };
    },
  };
  return { client: { from, storage } as unknown as SupabaseClient, tables, calls, files };
}

const ME = 'user-1';
const OTHER = 'user-2';
const photoUrl = (uid: string) => `https://x.supabase.co/storage/v1/object/public/avatars/${uid}/avatar.png?t=1`;
const both = (row: Row): Row[] => [{ ...row, id: `${row.id}-me`, user_id: ME }, { ...row, id: `${row.id}-other`, user_id: OTHER }];

const seed = () => ({
  accounts: both({ id: 'a', name: 'Debit', balance: 500 }),
  transactions: both({ id: 't', amount: 25, merchant: 'Shop' }),
  budgets: both({ id: 'b', category: 'Food', amount: 400 }),
  goals: both({ id: 'g', name: 'Fund', saved_amount: 300 }),
  advisor_sessions: both({ id: 's', session_type: 'analysis', result: { summary: 'You owe 12,000 on the card' } }),
  custom_categories: both({ id: 'c', name: 'Therapy', icon: 'heart' }),
  user_settings: both({ id: 'u', data: { monthly_income: 10000 } }),
  profiles: both({
    id: 'p', display_name: 'Sam', phone_number: '+971501234567',
    currency: 'USD', notify_email: true, notify_sms: true,
  }).map(p => ({ ...p, avatar_url: photoUrl(p.user_id as string) })),
});

const mine = (rows: Row[]) => rows.filter(r => r.user_id === ME);
const theirs = (rows: Row[]) => rows.filter(r => r.user_id === OTHER);

describe('deleteEverything', () => {
  it('removes the data the old Delete Everything left behind', async () => {
    const { client, tables } = fakeDb(seed());
    await deleteEverything(client, ME);

    // The four tables it always removed.
    for (const t of ['accounts', 'transactions', 'budgets', 'goals']) expect(mine(tables[t])).toEqual([]);
    // The ones it used to leave.
    expect(mine(tables.advisor_sessions)).toEqual([]);
    expect(mine(tables.custom_categories)).toEqual([]);
    expect(mine(tables.user_settings)).toEqual([]);
    expect(mine(tables.profiles)[0]).toMatchObject({ display_name: null, phone_number: null, notify_sms: false });
  });

  it('keeps the profile row, its currency and the email alert choice', async () => {
    const { client, tables } = fakeDb(seed());
    await deleteEverything(client, ME);
    expect(mine(tables.profiles)).toHaveLength(1);
    expect(mine(tables.profiles)[0]).toMatchObject({ currency: 'USD', notify_email: true });
  });

  // The photo used to stay on every Delete Everything.
  it('removes the photo file and its link once the storage policy is applied', async () => {
    const { client, tables, files } = fakeDb(seed());
    await expect(deleteEverything(client, ME)).resolves.toEqual({ photo: 'removed' });
    expect(files.has(`${ME}/avatar.png`)).toBe(false);
    expect(mine(tables.profiles)[0].avatar_url).toBeNull();
    // Another user's photo is not touched.
    expect(files.has(`${OTHER}/avatar.png`)).toBe(true);
    expect(theirs(tables.profiles)[0].avatar_url).toBe(photoUrl(OTHER));
  });

  it('says the photo was kept, and keeps its link, when storage hides the folder (policy not applied)', async () => {
    const { client, tables, files } = fakeDb(seed(), {}, 'missing');
    await expect(deleteEverything(client, ME)).resolves.toEqual({ photo: 'kept' });
    expect(files.has(`${ME}/avatar.png`)).toBe(true);
    expect(mine(tables.profiles)[0].avatar_url).toBe(photoUrl(ME));
  });

  it('does not trust a remove that answers ok: the folder is listed again', async () => {
    const { client, tables, calls } = fakeDb(seed(), {}, 'no-delete');
    await expect(deleteEverything(client, ME)).resolves.toEqual({ photo: 'kept' });
    expect(calls).toContain(`remove ${ME}/avatar.png`);
    expect(mine(tables.profiles)[0].avatar_url).toBe(photoUrl(ME));
  });

  it('clears a photo link that points to another site, with nothing to remove', async () => {
    const data = seed();
    mine(data.profiles)[0].avatar_url = 'https://lh3.example.com/me.png';
    const { client, tables, calls } = fakeDb(data, {}, 'missing');
    await expect(deleteEverything(client, ME)).resolves.toEqual({ photo: 'none' });
    expect(calls.some(c => c.startsWith('remove'))).toBe(false);
    expect(mine(tables.profiles)[0].avatar_url).toBeNull();
  });

  it('does not touch another user', async () => {
    const before = seed();
    const { client, tables } = fakeDb(before);
    await deleteEverything(client, ME);
    for (const t of Object.keys(before)) expect(theirs(tables[t])).toEqual(theirs(before[t as keyof typeof before]));
  });

  it('deletes transactions before accounts', async () => {
    const { client, calls } = fakeDb(seed());
    await deleteEverything(client, ME);
    expect(calls.indexOf('delete transactions')).toBeLessThan(calls.indexOf('delete accounts'));
  });

  it('carries on when a later table was never created', async () => {
    const data: Record<string, Row[]> = seed();
    delete data.user_settings;
    delete data.advisor_sessions;
    const { client, tables } = fakeDb(data);
    await expect(deleteEverything(client, ME)).resolves.toEqual({ photo: 'removed' });
    expect(mine(tables.custom_categories)).toEqual([]);
    expect(mine(tables.profiles)[0].display_name).toBeNull();
  });

  it('stops and names the table when a delete fails', async () => {
    const { client, tables } = fakeDb(seed(), { goals: { message: 'permission denied', code: '42501' } });
    await expect(deleteEverything(client, ME)).rejects.toThrow('goals: permission denied');
    // Nothing after the failure ran, so the name is still there to see.
    expect(mine(tables.accounts)).toHaveLength(1);
    expect(mine(tables.profiles)[0].display_name).toBe('Sam');
  });

  it('reports any other error on a later table', async () => {
    const { client } = fakeDb(seed(), { custom_categories: { message: 'permission denied', code: '42501' } });
    await expect(deleteEverything(client, ME)).rejects.toThrow('custom_categories: permission denied');
  });
});

describe('clearLocalData', () => {
  const fill = () => {
    localStorage.clear();
    const keys = [
      'spendpal_networth_history', 'spendpal_rollover_cats', 'spendpal_monthly_income', 'spendpal_nw_goal',
      'spendpal_payday', 'spendpal_budget_templates', 'spendpal-budget-alerted', 'spendpal_rate_AED_USD',
      'balanceHidden', 'secondaryCurrency', 'theme', 'sb-project-auth-token',
      userKey(ME, 'settings'), userKey(ME, 'budget_alerted'), userKey(ME, 'balance_hidden'),
      userKey(OTHER, 'settings'), userKey(OTHER, 'balance_hidden'),
    ];
    for (const k of keys) localStorage.setItem(k, 'x');
  };
  const left = () => Object.keys(localStorage).sort();
  const otherUser = [userKey(OTHER, 'balance_hidden'), userKey(OTHER, 'settings')];

  it('removes every list the app keeps in the browser for this user, not just three of them', () => {
    fill();
    clearLocalData(localStorage, { userId: ME });
    expect(left()).toEqual(['balanceHidden', 'sb-project-auth-token', 'secondaryCurrency', userKey(ME, 'balance_hidden'), ...otherUser, 'theme'].sort());
  });

  it('also removes the per-device choices when the account goes, and leaves the session to sign-out', () => {
    fill();
    clearLocalData(localStorage, { userId: ME, account: true });
    expect(left()).toEqual(['sb-project-auth-token', ...otherUser, 'theme'].sort());
  });
});

describe('deleteAccount', () => {
  type Invoke = { data: unknown; error: { name: string; context?: { status?: number } } | null };
  type GetUser = { data: { user: unknown }; error: { code?: string; status?: number } | null };
  const stillThere: GetUser = { data: { user: { id: ME } }, error: null };
  const gone: GetUser = { data: { user: null }, error: { code: 'user_not_found', status: 403 } };

  function fakeClient(invoke: Invoke | Error, getUser: GetUser | Error = stillThere) {
    const invoked: Array<[string, unknown]> = [];
    const client = {
      functions: {
        invoke: async (name: string, opts: unknown) => {
          invoked.push([name, opts]);
          if (invoke instanceof Error) throw invoke;
          return invoke;
        },
      },
      auth: { getUser: async () => { if (getUser instanceof Error) throw getUser; return getUser; } },
    } as unknown as SupabaseClient;
    return { client, invoked };
  }

  it('calls the delete-account function with no body', async () => {
    const { client, invoked } = fakeClient({ data: { ok: true }, error: null });
    expect(await deleteAccount(client)).toBe('deleted');
    expect(invoked).toEqual([['delete-account', { method: 'POST' }]]);
  });

  it('says "not available" when the function is not deployed (404)', async () => {
    const { client } = fakeClient({ data: null, error: { name: 'FunctionsHttpError', context: { status: 404 } } });
    expect(await deleteAccount(client)).toBe('unavailable');
  });

  it('says "not available" when the browser could not send the request and the user still exists', async () => {
    const { client } = fakeClient({ data: null, error: { name: 'FunctionsFetchError' } });
    expect(await deleteAccount(client)).toBe('unavailable');
  });

  it('says "failed" when the function answered with an error and the user still exists', async () => {
    const { client } = fakeClient({ data: null, error: { name: 'FunctionsHttpError', context: { status: 500 } } });
    expect(await deleteAccount(client)).toBe('failed');
  });

  it('says "failed" when the function answered without ok', async () => {
    const { client } = fakeClient({ data: { ok: false }, error: null });
    expect(await deleteAccount(client)).toBe('failed');
  });

  it('says "deleted" when the answer was lost but the server no longer knows the user', async () => {
    const { client } = fakeClient({ data: null, error: { name: 'FunctionsFetchError' } }, gone);
    expect(await deleteAccount(client)).toBe('deleted');
  });

  it('makes no claim when the server cannot be asked', async () => {
    const offline = fakeClient(new TypeError('Failed to fetch'), new TypeError('Failed to fetch'));
    expect(await deleteAccount(offline.client)).toBe('unreachable');
    const noAnswer = fakeClient(
      { data: null, error: { name: 'FunctionsFetchError' } },
      { data: { user: null }, error: { status: 0 } },
    );
    expect(await deleteAccount(noAnswer.client)).toBe('unreachable');
  });
});
