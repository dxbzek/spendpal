// Restore must never leave the account empty, and a load must not stop at 1,000 rows.
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows, fetchAllById, prepareRestore, restoreBackup, exportBackup, RestoreError } from '@/lib/backup';

type Row = Record<string, unknown>;

/** In-memory stand-in for the Supabase client: just the calls backup.ts makes. */
interface FakeOpts {
  failInsert?: (table: string, call: number) => boolean;
  pageCap?: number;
  /** Runs before each select is answered: a write from another device between two pages. */
  beforeSelect?: (table: string, call: number, tables: Record<string, Row[]>) => void;
}
function fakeDb(seed: Record<string, Row[]>, opts: FakeOpts = {}) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const inserts: Record<string, number> = {};
  const selects: Record<string, number> = {};
  const from = (name: string) => {
    tables[name] ??= [];
    const filters: Array<[string, unknown]> = [];
    let op: 'select' | 'delete' | 'update' = 'select';
    let patch: Row = {};
    let range: [number, number] | null = null;
    let after: string | null = null;
    let limit = Infinity;
    const match = (r: Row) => filters.every(([k, v]) => r[k] === v) && (after === null || String(r.id) > after);
    const run = () => {
      if (op === 'delete') { tables[name] = tables[name].filter(r => !match(r)); return { data: null, error: null }; }
      if (op === 'update') { tables[name].filter(match).forEach(r => Object.assign(r, patch)); return { data: null, error: null }; }
      selects[name] = (selects[name] ?? 0) + 1;
      opts.beforeSelect?.(name, selects[name], tables);
      const all = tables[name].filter(match).sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
      const [f, t] = range ?? [0, all.length - 1];
      const cap = Math.min(opts.pageCap ?? Infinity, limit);
      return { data: all.slice(f, Math.min(t + 1, f + cap)), error: null, count: all.length };
    };
    const q = {
      select: () => q,
      order: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      range: (f: number, t: number) => { range = [f, t]; return q; },
      gt: (_k: string, v: string) => { after = v; return q; },
      limit: (n: number) => { limit = n; return q; },
      delete: () => { op = 'delete'; return q; },
      update: (p: Row) => { op = 'update'; patch = p; return q; },
      insert: (rows: Row[]) => {
        inserts[name] = (inserts[name] ?? 0) + 1;
        if (opts.failInsert?.(name, inserts[name])) return Promise.resolve({ error: { message: `insert into ${name} failed` } });
        tables[name].push(...rows.map(r => ({ created_at: '2026-01-01T00:00:00Z', ...r })));
        return Promise.resolve({ error: null });
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  return { client: { from } as unknown as SupabaseClient, tables };
}

const USER = 'user-1';
const account = (id: string, name: string, balance: number): Row =>
  ({ id, user_id: USER, name, type: 'debit', balance, currency: 'AED', icon: 'bank', created_at: `2026-01-0${id.slice(-1)}T00:00:00Z` });
const tx = (id: string, accountId: string, amount: number, date = '2026-11-01'): Row =>
  ({ id, user_id: USER, account_id: accountId, type: 'expense', amount, currency: 'AED', category: 'Food', category_icon: 'utensils', merchant: 'Shop', date, is_pending: false });

const live = () => ({
  accounts: [account('a1', 'Debit', 500), account('a2', 'Cash', 20)],
  transactions: [tx('t1', 'a1', 10), tx('t2', 'a1', 25), tx('t3', 'a2', 5)],
  budgets: [{ id: 'b1', user_id: USER, category: 'Food', category_icon: 'utensils', amount: 400, period: 'monthly', month: '2026-11', is_fixed: true }],
  goals: [{ id: 'g1', user_id: USER, name: 'Fund', icon: 'target', type: 'savings', target_amount: 5000, saved_amount: 300, status: 'active' }],
  goal_contributions: [{ id: 'c1', user_id: USER, goal_id: 'g1', amount: 300, note: 'first', created_at: '2026-10-01T00:00:00Z' }],
});

const summary = (t: Record<string, Row[]>) => ({
  accounts: t.accounts.map(a => [a.name, a.balance]).sort(),
  transactions: t.transactions.map(x => x.amount).sort(),
  budgets: t.budgets.map(b => [b.category, b.amount, b.is_fixed]),
  goals: t.goals.map(g => [g.name, g.saved_amount]),
  contributions: t.goal_contributions.map(c => [c.amount, c.note]),
});

describe('fetchAllRows', () => {
  it('reads past the 1,000-row page limit', async () => {
    const all = Array.from({ length: 2350 }, (_, i) => i);
    const calls: number[] = [];
    const rows = await fetchAllRows<number>(async (from, to) => { calls.push(from); return { data: all.slice(from, to + 1), error: null, count: all.length }; });
    expect(rows).toHaveLength(2350);
    expect(calls).toEqual([0, 1000, 2000]);
  });

  it('keeps going when the server returns smaller pages than asked for', async () => {
    const all = Array.from({ length: 1200 }, (_, i) => i);
    const rows = await fetchAllRows<number>(async from => ({ data: all.slice(from, from + 500), error: null, count: all.length }));
    expect(rows).toHaveLength(1200);
  });

  it('makes one request for a short list, and throws on an error', async () => {
    let n = 0;
    await fetchAllRows(async () => { n++; return { data: [1, 2], error: null, count: 2 }; });
    expect(n).toBe(1);
    // A real Error, so a caller that prints err.message shows the reason.
    const err = await fetchAllRows(async () => ({ data: null, error: { message: 'offline' } })).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('offline');
  });

  // A list that another device changes while page `changeOn` is being asked for.
  const movingList = (n: number, changeOn: number, change: (list: Array<{ id: number }>) => void) => {
    const list = Array.from({ length: n }, (_, i) => ({ id: i }));
    let calls = 0;
    const page = async (from: number, to: number) => {
      if (++calls === changeOn) change(list);
      return { data: list.slice(from, to + 1), error: null, count: list.length };
    };
    return { list, page };
  };
  const ids = (rows: Array<{ id: number }>) => rows.map(r => r.id).sort((a, b) => a - b);

  it('returns no row twice when a row is added between pages', async () => {
    const { list, page } = movingList(2500, 2, l => l.unshift({ id: -1 }));
    const rows = await fetchAllRows(page);
    expect(new Set(ids(rows)).size).toBe(rows.length);
    expect(ids(rows)).toEqual(ids(list));
  });

  it('drops no live row when a row is removed between pages', async () => {
    const { list, page } = movingList(2500, 2, l => l.splice(0, 1));
    const rows = await fetchAllRows(page);
    expect(ids(rows)).toContain(1000);
    expect(ids(rows)).toEqual(ids(list));
  });

  it('stops re-reading a list that never stops moving, still without repeats', async () => {
    let next = -1;
    const list = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
    let calls = 0;
    const rows = await fetchAllRows(async (from, to) => {
      calls++;
      if (from > 0) list.unshift({ id: next-- });
      return { data: list.slice(from, to + 1), error: null, count: list.length };
    });
    expect(new Set(ids(rows)).size).toBe(rows.length);
    expect(calls).toBeLessThanOrEqual(7);
  });

  it('drops repeats when the server sends no count', async () => {
    const list = Array.from({ length: 1200 }, (_, i) => ({ id: i }));
    let calls = 0;
    const rows = await fetchAllRows(async (from, to) => {
      if (++calls === 2) list.unshift({ id: -1 });
      return { data: list.slice(from, to + 1), error: null };
    });
    expect(new Set(ids(rows)).size).toBe(rows.length);
  });
});

describe('fetchAllById', () => {
  const store = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${String(i).padStart(5, '0')}` }));
  const pageOf = (list: Array<{ id: string }>, onCall?: (call: number) => void) => {
    let calls = 0;
    const afters: Array<string | null> = [];
    const page = async (after: string | null, limit: number) => {
      onCall?.(++calls);
      afters.push(after);
      const left = list.filter(r => after === null || r.id > after).sort((a, b) => (a.id < b.id ? -1 : 1));
      return { data: left.slice(0, limit), error: null, count: left.length };
    };
    return { page, afters };
  };

  it('asks for each page after the last id of the one before', async () => {
    const { page, afters } = pageOf(store(2350));
    const rows = await fetchAllById(page);
    expect(rows).toHaveLength(2350);
    expect(afters).toEqual([null, 'r00999', 'r01999']);
  });

  it('neither repeats nor skips a row when rows are added and removed between pages', async () => {
    const list = store(2500);
    const { page } = pageOf(list, call => {
      if (call !== 2) return;
      list.unshift({ id: 'a-new-first-row' }); // sorts before every row already read
      list.splice(list.findIndex(r => r.id === 'r00500'), 1);
    });
    const got = (await fetchAllById(page)).map(r => r.id);
    expect(new Set(got).size).toBe(got.length);
    // Every row that was there the whole time is in the result once.
    expect(got).toContain('r01000');
    expect(got.filter(id => id !== 'r00500')).toEqual(list.filter(r => r.id !== 'a-new-first-row').map(r => r.id));
  });

  it('reads on to an empty page when there is no count, and throws a real Error', async () => {
    const list = store(1200);
    const rows = await fetchAllById(async (after, limit) =>
      ({ data: list.filter(r => after === null || r.id > after).slice(0, Math.min(limit, 500)), error: null }));
    expect(rows).toHaveLength(1200);
    const err = await fetchAllById(async () => ({ data: null, error: { message: 'offline' } })).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('offline');
  });
});

describe('prepareRestore', () => {
  it('rejects a bad file before anything is written', () => {
    expect(() => prepareRestore({ accounts: [] }, USER)).toThrow(/Invalid backup file/);
    const bad = { version: 2, ...live(), transactions: [tx('t1', 'a1', 10, '11/01/2026')] };
    expect(() => prepareRestore(bad, USER)).toThrow(/transaction 1: date must be YYYY-MM-DD.*Nothing was changed/);
  });

  it('reads a version 1 file (camelCase app objects)', () => {
    const v1 = {
      version: 1,
      accounts: [{ id: 'old', name: 'Card', type: 'credit', balance: 900, currency: 'AED', icon: 'card', creditLimit: 5000, dueDate: 12 }],
      transactions: [
        { id: 'x', accountId: 'old', type: 'expense', amount: 50, currency: 'AED', category: 'Food', categoryIcon: 'utensils', merchant: 'Cafe', date: '2026-10-02', isPending: true, dupeDismissed: true },
        { id: 'y', accountId: 'gone', type: 'expense', amount: 5, currency: 'AED', category: 'Food', categoryIcon: 'utensils', merchant: 'Cafe', date: '2026-10-02' },
      ],
      budgets: [{ category: 'Food', categoryIcon: 'utensils', amount: 400, period: 'monthly', month: '2026-10', isFixed: true }],
    };
    const prep = prepareRestore(v1, USER, () => 'new-id');
    expect(prep.accounts[0]).toMatchObject({ id: 'new-id', user_id: USER, balance: 0, credit_limit: 5000, due_date: 12 });
    expect(prep.balances).toEqual([{ id: 'new-id', balance: 900 }]);
    expect(prep.transactions).toHaveLength(1);
    expect(prep.transactions[0]).toMatchObject({ account_id: 'new-id', category_icon: 'utensils', is_pending: true, dupe_dismissed: true });
    expect(prep.skippedTransactions).toBe(1);
    expect(prep.budgets[0]).toMatchObject({ is_fixed: true });
  });
});

describe('restoreBackup', () => {
  it('round-trips an export, keeping balances, budget flags and goal contributions', async () => {
    const source = fakeDb(live());
    const backup = await exportBackup(source.client, USER);
    const target = fakeDb({ accounts: [account('z9', 'Old', 1)], transactions: [], budgets: [], goals: [], goal_contributions: [] });
    const result = await restoreBackup(target.client, USER, backup);
    expect(result).toEqual({ accounts: 2, transactions: 3, skippedTransactions: 0 });
    expect(summary(target.tables)).toEqual(summary(source.tables));
    expect(target.tables.goal_contributions[0].created_at).toBe('2026-10-01T00:00:00Z');
  });

  it('exports every row, not one page', async () => {
    const many = { ...live(), transactions: Array.from({ length: 2100 }, (_, i) => tx(`t${String(i).padStart(5, '0')}`, 'a1', 1)) };
    const backup = await exportBackup(fakeDb(many, { pageCap: 1000 }).client, USER);
    expect(backup.transactions).toHaveLength(2100);
  });

  // 2,100 transactions, and another device writes while the second page is asked for.
  const exportDuring = async (write: (tables: Record<string, Row[]>) => void) => {
    const many = { ...live(), transactions: Array.from({ length: 2100 }, (_, i) => tx(`t${String(i).padStart(5, '0')}`, 'a1', 1)) };
    const db = fakeDb(many, { beforeSelect: (table, call, tables) => { if (table === 'transactions' && call === 2) write(tables); } });
    return (await exportBackup(db.client, USER)).transactions.map(r => r.id);
  };

  it('exports no row twice when a row is added while the pages load', async () => {
    const got = await exportDuring(t => { t.transactions.unshift(tx('a-new-first-row', 'a1', 7)); });
    expect(new Set(got).size).toBe(got.length);
    expect(got).toHaveLength(2100);
  });

  it('exports every live row when a row is deleted while the pages load', async () => {
    const got = await exportDuring(t => { t.transactions = t.transactions.filter(r => r.id !== 't00500'); });
    expect(got).toContain('t01000');
    expect(got).toHaveLength(2100);
  });

  it('puts the previous data back when the restore fails part-way', async () => {
    // The first transactions insert fails (the new file); the roll-back insert succeeds.
    const db = fakeDb(live(), { failInsert: (table, call) => table === 'transactions' && call === 1 });
    const before = summary(db.tables);
    let snapshot: unknown = null;
    const file = { version: 2, ...live(), accounts: [account('n1', 'New', 1)], transactions: [tx('q', 'n1', 99)] };
    const err = await restoreBackup(db.client, USER, file, s => { snapshot = s; }).catch(e => e);
    expect(err).toBeInstanceOf(RestoreError);
    expect(err.rolledBack).toBe(true);
    expect(snapshot).toMatchObject({ version: 2 });
    expect(summary(db.tables)).toEqual(before);
  });

  it('says so when the roll-back fails too, after handing over the safety copy', async () => {
    const db = fakeDb(live(), { failInsert: table => table === 'transactions' });
    let snapshot: { transactions: Row[] } | null = null;
    const err = await restoreBackup(db.client, USER, { version: 2, ...live() }, s => { snapshot = s; }).catch(e => e);
    expect(err).toBeInstanceOf(RestoreError);
    expect(err.rolledBack).toBe(false);
    expect(snapshot!.transactions).toHaveLength(3);
  });

  it('touches nothing when the file is invalid', async () => {
    const db = fakeDb(live());
    const before = JSON.stringify(db.tables);
    const file = { version: 2, accounts: [{ id: 'a', type: 'debit', balance: 1 }], transactions: [] };
    await expect(restoreBackup(db.client, USER, file)).rejects.toThrow(/Nothing was changed/);
    expect(JSON.stringify(db.tables)).toBe(before);
  });
});
