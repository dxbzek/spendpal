// Restore must never leave the account empty, and a load must not stop at 1,000 rows.
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows, fetchAllById, prepareRestore, instalmentsOk, weeklyToMonthly, restoreBackup, exportBackup, RestoreError } from '@/lib/backup';

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
    expect(() => prepareRestore(bad, USER)).toThrow(/transaction 1: date must be a real date, YYYY-MM-DD.*Nothing was changed/);
  });

  // The database allows an amount of 0 (CHECK amount >= 0). Refusing it here
  // made an account that holds one such row impossible to export and restore.
  it('accepts a zero-amount transaction and budget, as the database does', () => {
    const file = {
      version: 2, ...live(),
      transactions: [tx('t1', 'a1', 10), tx('t2', 'a1', 0)],
      budgets: [{ ...live().budgets[0], amount: 0 }],
    };
    const prep = prepareRestore(file, USER);
    expect(prep.transactions.map(t => t.amount)).toEqual([10, 0]);
    expect(prep.budgets[0].amount).toBe(0);
  });

  it('refuses every row the database would refuse, naming the row', () => {
    const base = () => ({ version: 2, ...live() });
    const withTx = (patch: Row) => ({ ...base(), transactions: [tx('t1', 'a1', 10), { ...tx('t2', 'a1', 25), ...patch }] });
    const withAccount = (patch: Row) => ({ ...base(), accounts: [{ ...account('a1', 'Debit', 500), ...patch }] });
    const withGoal = (patch: Row) => ({ ...base(), goals: [{ ...live().goals[0], ...patch }] });
    const withBudget = (patch: Row) => ({ ...base(), budgets: [{ ...live().budgets[0], ...patch }] });
    const cases: Array<[string, unknown, RegExp]> = [
      ['negative amount', withTx({ amount: -1 }), /transaction 2: amount must be 0 or more/],
      ['amount as text', withTx({ amount: '25' }), /transaction 2: amount must be 0 or more/],
      ['missing amount', withTx({ amount: null }), /transaction 2: amount must be 0 or more/],
      ['blank merchant', withTx({ merchant: '  ' }), /transaction 2: needs a merchant/],
      ['missing merchant', withTx({ merchant: undefined }), /transaction 2: needs a merchant/],
      ['blank category', withTx({ category: ' ' }), /transaction 2: needs a category/],
      ['a date that does not exist', withTx({ date: '2026-02-31' }), /transaction 2: date must be a real date/],
      ['unknown type', withTx({ type: 'refund' }), /transaction 2: type must be/],
      ['instalment 5 of 3', withTx({ total_installments: 3, current_installment: 5 }), /transaction 2: instalments paid must be between 0 and the instalment count/],
      ['a plan of 0 instalments', withTx({ total_installments: 0, current_installment: 0 }), /transaction 2: instalments paid/],
      ['half an instalment', withTx({ total_installments: 3, current_installment: 1.5 }), /transaction 2: instalments paid must be a whole number/],
      ['negative remaining principal', withTx({ remaining_principal: -1 }), /transaction 2: remaining principal/],
      ['a plan id that is not an id', withTx({ plan_id: 'plan-1' }), /transaction 2: plan_id is not an id/],
      ['a flag that is not true or false', withTx({ is_pending: 'yes' }), /transaction 2: is_pending/],
      ['blank account name', withAccount({ name: '' }), /account 1: needs a name/],
      ['unknown account type', withAccount({ type: 'loan' }), /account 1: type must be/],
      ['negative credit limit', withAccount({ credit_limit: -1 }), /account 1: credit limit/],
      ['due day 45', withAccount({ due_date: 45 }), /account 1: due day must be 1 to 31/],
      ['statement day 0', withAccount({ statement_date: 0 }), /account 1: statement day/],
      ['negative APR', withAccount({ apr: -2 }), /account 1: APR/],
      ['negative statement total', withAccount({ statement_total_due: -1 }), /account 1: statement total/],
      ['budget period yearly', withBudget({ period: 'yearly' }), /budget 1: period must be monthly or weekly/],
      ['negative budget', withBudget({ amount: -5 }), /budget 1: amount must be 0 or more/],
      ['blank budget category', withBudget({ category: '' }), /budget 1: needs a category/],
      ['two budgets for one category and month',
        { ...base(), budgets: [live().budgets[0], { ...live().budgets[0], id: 'b2', amount: 90 }] },
        /budget 2: same category and month as budget 1/],
      ['goal status archived', withGoal({ status: 'archived' }), /goal 1: status must be/],
      ['negative saved amount', withGoal({ saved_amount: -5 }), /goal 1: saved amount/],
      ['target of 0', withGoal({ target_amount: 0 }), /goal 1: target must be above 0/],
      ['goal without a type', withGoal({ type: null }), /goal 1: needs a type/],
      ['blank goal name', withGoal({ name: ' ' }), /goal 1: needs a name/],
      ['contribution of -5', { ...base(), goal_contributions: [{ ...live().goal_contributions[0], amount: -5 }] }, /goal contribution 1: amount must be above 0/],
      ['contribution of 0', { ...base(), goal_contributions: [{ ...live().goal_contributions[0], amount: 0 }] }, /goal contribution 1: amount must be above 0/],
    ];
    for (const [name, file, reason] of cases) {
      expect(() => prepareRestore(file, USER), name).toThrow(reason);
    }
    // The untouched file passes, so each case fails for its own reason only.
    expect(() => prepareRestore(base(), USER)).not.toThrow();
  });

  it('names a row by its place in the file, not its place after sorting', () => {
    const file = {
      version: 2, ...live(),
      // Sorted by creation time the bad row would come first.
      accounts: [account('a2', 'Later', 1), { ...account('a1', '', 1) }],
      transactions: [],
    };
    expect(() => prepareRestore(file, USER)).toThrow(/account 2: needs a name/);
  });

  it('reads the instalment rule the way the database does', () => {
    expect(instalmentsOk(null, null)).toBe(true);
    expect(instalmentsOk(undefined, undefined)).toBe(true);
    expect(instalmentsOk(12, 0)).toBe(true);   // a plan with nothing paid yet
    expect(instalmentsOk(12, 12)).toBe(true);
    expect(instalmentsOk(12, 13)).toBe(false);
    expect(instalmentsOk(12, -1)).toBe(false);
    expect(instalmentsOk(0, 0)).toBe(false);
    // One value on its own is "unknown" to a CHECK and passes, unless its own half fails.
    expect(instalmentsOk(12, null)).toBe(true);
    expect(instalmentsOk(null, 3)).toBe(true);
    expect(instalmentsOk(-1, null)).toBe(false);
    expect(instalmentsOk(null, -1)).toBe(false);
    const file = { version: 2, ...live(), transactions: [{ ...tx('t1', 'a1', 100), total_installments: 12, current_installment: 0 }] };
    expect(prepareRestore(file, USER).transactions[0]).toMatchObject({ total_installments: 12, current_installment: 0 });
  });

  it('turns a weekly budget into a monthly one, to the cent', () => {
    expect(weeklyToMonthly(100)).toBe(433.33);
    expect(weeklyToMonthly(150)).toBe(650);
    expect(weeklyToMonthly(0)).toBe(0);
    const file = {
      version: 2, ...live(),
      budgets: [
        { ...live().budgets[0], period: 'weekly', amount: 100 },
        { ...live().budgets[0], id: 'b2', category: 'Fuel', amount: 300 },
      ],
    };
    expect(prepareRestore(file, USER).budgets.map(b => [b.category, b.period, b.amount]))
      .toEqual([['Food', 'monthly', 433.33], ['Fuel', 'monthly', 300]]);
    // A weekly and a monthly budget for one category and month would become two monthly ones.
    const clash = { ...file, budgets: [file.budgets[0], { ...live().budgets[0], id: 'b3' }] };
    expect(() => prepareRestore(clash, USER)).toThrow(/budget 2: same category and month as budget 1/);
  });

  it('keeps the plan and transfer ids, and leaves empty values out', () => {
    const plan = '11111111-2222-4333-8444-555555555555';
    const pair = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const file = {
      version: 2, ...live(),
      transactions: [
        { ...tx('t1', 'a1', 50), plan_id: plan, total_installments: 4, current_installment: 1, note: null },
        { ...tx('t2', 'a1', 50), plan_id: plan, total_installments: 4, current_installment: 2 },
        { ...tx('t3', 'a1', 20), type: 'transfer', transfer_id: pair, plan_id: null },
        { ...tx('t4', 'a2', 20), type: 'transfer', transfer_id: pair },
      ],
    };
    const prep = prepareRestore(file, USER);
    expect(prep.transactions.map(t => t.plan_id)).toEqual([plan, plan, undefined, undefined]);
    expect(prep.transactions.map(t => t.transfer_id)).toEqual([undefined, undefined, pair, pair]);
    expect('note' in prep.transactions[0]).toBe(false);
    expect('plan_id' in prep.transactions[2]).toBe(false);
    // The database makes these ids, so the file's own never go back in.
    expect('id' in prep.transactions[0]).toBe(false);
  });

  it('gives accounts and goals a creation time each, so their order survives one transaction', () => {
    const file = {
      version: 2, ...live(),
      accounts: [account('a2', 'Second', 1), account('a1', 'First', 1), { ...account('a3', 'No time', 1), created_at: undefined }],
      transactions: [],
    };
    const now = Date.parse('2026-11-14T10:00:00.000Z');
    const prep = prepareRestore(file, USER, undefined, now);
    expect(prep.accounts.map(a => [a.name, a.created_at])).toEqual([
      // Rows without a time sort first (as before) and get one from the clock.
      ['No time', '2026-11-14T10:00:00.000Z'],
      ['First', '2026-01-01T00:00:00Z'],
      ['Second', '2026-01-02T00:00:00Z'],
    ]);
    expect(prep.goals[0].created_at).toBe('2026-11-14T10:00:00.001Z');
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
