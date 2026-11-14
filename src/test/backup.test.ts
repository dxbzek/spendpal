// Restore must never leave the account empty, and a load must not stop at 1,000 rows.
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows, prepareRestore, restoreBackup, exportBackup, RestoreError } from '@/lib/backup';

type Row = Record<string, unknown>;

/** In-memory stand-in for the Supabase client: just the calls backup.ts makes. */
function fakeDb(seed: Record<string, Row[]>, opts: { failInsert?: (table: string, call: number) => boolean; pageCap?: number } = {}) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const inserts: Record<string, number> = {};
  const from = (name: string) => {
    tables[name] ??= [];
    const filters: Array<[string, unknown]> = [];
    let op: 'select' | 'delete' | 'update' = 'select';
    let patch: Row = {};
    let range: [number, number] | null = null;
    const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
    const run = () => {
      if (op === 'delete') { tables[name] = tables[name].filter(r => !match(r)); return { data: null, error: null }; }
      if (op === 'update') { tables[name].filter(match).forEach(r => Object.assign(r, patch)); return { data: null, error: null }; }
      const all = tables[name].filter(match).sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const [f, t] = range ?? [0, all.length - 1];
      const cap = opts.pageCap ?? Infinity;
      return { data: all.slice(f, Math.min(t + 1, f + cap)), error: null, count: all.length };
    };
    const q = {
      select: () => q,
      order: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      range: (f: number, t: number) => { range = [f, t]; return q; },
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
    await expect(fetchAllRows(async () => ({ data: null, error: { message: 'offline' } }))).rejects.toMatchObject({ message: 'offline' });
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
