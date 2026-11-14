// Restore must change everything or nothing, and a load must not stop at 1,000 rows.
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchAllRows, fetchAllById, prepareRestore, instalmentsOk, weeklyToMonthly, restoreBackup, exportBackup,
  restorePayloadBytes, RestoreError, MAX_RESTORE_BYTES,
} from '@/lib/backup';
import type { BackupV2, RestorePayload } from '@/lib/backup';

type Row = Record<string, unknown>;

const USER = 'user-1';
const OWNED = ['goal_contributions', 'transactions', 'budgets', 'goals', 'accounts'];

interface FakeOpts {
  pageCap?: number;
  /** Runs before each select is answered: a write from another device between two pages. */
  beforeSelect?: (table: string, call: number, tables: Record<string, Row[]>) => void;
  /** Every read fails with this message, as when offline. */
  failSelect?: string;
  /** A transaction row the database refuses part-way through the restore. */
  refuses?: (transaction: Row) => boolean;
  /** Answer the restore call with this instead of running it (an API refusal, or no answer). */
  rpcAnswer?: { error: { message: string; code?: string }; status: number };
}

/**
 * In-memory stand-in for the Supabase client: just the calls backup.ts makes.
 * Tables can only be read. The one way to write is the restore_backup call,
 * so a test that passes proves the restore made no other write.
 */
function fakeDb(seed: Record<string, Row[]>, opts: FakeOpts = {}) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const selects: Record<string, number> = {};
  const rpcCalls: Array<{ fn: string; payload: RestorePayload }> = [];
  let made = 0;
  const from = (name: string) => {
    tables[name] ??= [];
    const filters: Array<[string, unknown]> = [];
    let range: [number, number] | null = null;
    let after: string | null = null;
    let limit = Infinity;
    const match = (r: Row) => filters.every(([k, v]) => r[k] === v) && (after === null || String(r.id) > after);
    const run = () => {
      selects[name] = (selects[name] ?? 0) + 1;
      if (opts.failSelect) return { data: null, error: { message: opts.failSelect }, count: null };
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
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };

  // restore_backup as the shared contract describes it. One transaction: the
  // work is done on a copy, which replaces the tables only if every step passed.
  const rpc = async (fn: string, args: { payload: RestorePayload }) => {
    rpcCalls.push({ fn, payload: args.payload });
    if (opts.rpcAnswer) return { data: null, ...opts.rpcAnswer };
    const next: Record<string, Row[]> = JSON.parse(JSON.stringify(tables));
    for (const name of OWNED) next[name] = (next[name] ?? []).filter(r => r.user_id !== USER);
    const p = args.payload;
    const stamp = '2026-11-14T00:00:00Z';
    // user_id is forced to the caller, whatever the payload says.
    const own = (r: Row) => ({ ...r, user_id: USER });
    next.accounts.push(...p.accounts.map(a => ({ created_at: stamp, ...own(a), balance: 0 })));
    for (const t of p.transactions) {
      if (opts.refuses?.(t)) {
        return { data: null, error: { message: 'new row for relation "transactions" violates check constraint', code: '23514' }, status: 400 };
      }
      next.transactions.push({ id: `tx-${++made}`, created_at: stamp, ...own(t) });
      // The balance trigger replays each row onto its account.
      const acct = next.accounts.find(a => a.id === t.account_id)!;
      acct.balance = (acct.balance as number) + (t.type === 'income' ? 1 : -1) * (t.amount as number);
    }
    for (const { id, balance } of p.balances) next.accounts.find(a => a.id === id)!.balance = balance;
    next.budgets.push(...p.budgets.map(b => ({ id: `b-${++made}`, created_at: stamp, ...own(b) })));
    next.goals.push(...p.goals.map(g => ({ created_at: stamp, ...own(g) })));
    next.goal_contributions.push(...p.goal_contributions.map(c => ({ id: `c-${++made}`, created_at: stamp, ...own(c) })));
    Object.assign(tables, next);
    return { data: { accounts: p.accounts.length, transactions: p.transactions.length }, error: null, status: 200 };
  };

  return { client: { from, rpc } as unknown as SupabaseClient, tables, rpcCalls, selects };
}

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
    expect(() => prepareRestore(bad, USER)).toThrow(/transaction 1: date must be a real date, YYYY-MM-DD\.$/);
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
  it('round-trips an export in one database call, keeping balances, budget flags and goal contributions', async () => {
    const source = fakeDb(live());
    const backup = await exportBackup(source.client, USER);
    const target = fakeDb({ accounts: [account('z9', 'Old', 1)], transactions: [], budgets: [], goals: [], goal_contributions: [] });
    const result = await restoreBackup(target.client, USER, backup);
    expect(result).toEqual({ accounts: 2, transactions: 3, skippedTransactions: 0 });
    expect(summary(target.tables)).toEqual(summary(source.tables));
    expect(target.tables.goal_contributions[0].created_at).toBe('2026-10-01T00:00:00Z');
    // One request, so the database can make it one transaction.
    expect(target.rpcCalls.map(c => c.fn)).toEqual(['restore_backup']);
    expect(Object.keys(target.rpcCalls[0].payload).sort())
      .toEqual(['accounts', 'balances', 'budgets', 'goal_contributions', 'goals', 'transactions']);
    // Accounts are listed by creation time, and one transaction has one clock time.
    expect(target.tables.accounts.map(a => [a.name, a.created_at]))
      .toEqual([['Debit', '2026-01-01T00:00:00Z'], ['Cash', '2026-01-02T00:00:00Z']]);
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

  const otherFile = () => ({ version: 2, ...live(), accounts: [account('n1', 'New', 1)], transactions: [tx('q', 'n1', 99)] });

  it('changes nothing when the database refuses a row part-way, and says so', async () => {
    const db = fakeDb(live(), { refuses: t => t.amount === 99 });
    const before = JSON.stringify(db.tables);
    let snapshot: BackupV2 | null = null;
    const err = await restoreBackup(db.client, USER, otherFile(), s => { snapshot = s; }).catch(e => e);
    expect(err).toBeInstanceOf(RestoreError);
    expect(err.unchanged).toBe(true);
    expect(err.message).toBe('Restore failed (new row for relation "transactions" violates check constraint). Nothing was changed.');
    expect(JSON.stringify(db.tables)).toBe(before);
    // The safety copy was still handed over before the call.
    expect(snapshot!.transactions).toHaveLength(3);
    expect(db.rpcCalls).toHaveLength(1);
  });

  it('restores over, and back from, live data that holds a zero-amount row', async () => {
    // The row the old checker refused. It stopped the roll-back and made the safety file useless.
    const db = fakeDb({ ...live(), transactions: [...live().transactions, tx('t4', 'a1', 0)], budgets: [{ ...live().budgets[0], amount: 0 }] });
    const before = summary(db.tables);
    let snapshot: BackupV2 | null = null;
    await restoreBackup(db.client, USER, otherFile(), s => { snapshot = s; });
    expect(db.tables.accounts.map(a => a.name)).toEqual(['New']);
    // Going back: the safety copy is a file the restore accepts.
    const back = await restoreBackup(db.client, USER, JSON.parse(JSON.stringify(snapshot)));
    expect(back).toEqual({ accounts: 2, transactions: 4, skippedTransactions: 0 });
    expect(summary(db.tables)).toEqual(before);
  });

  it('gives the real reason when the safety copy cannot be read, and changes nothing', async () => {
    const db = fakeDb(live(), { failSelect: 'TypeError: Failed to fetch' });
    let handed = false;
    const err = await restoreBackup(db.client, USER, otherFile(), () => { handed = true; }).catch(e => e);
    expect(err).toBeInstanceOf(RestoreError);
    expect(err.message).toBe('Could not read your current data to make the safety copy (TypeError: Failed to fetch). Nothing was changed.');
    expect(err.unchanged).toBe(true);
    expect(handed).toBe(false);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('stops before the database call when the safety copy could not be imported again', async () => {
    // The database takes any text as a budget month. A backup file does not.
    const db = fakeDb({ ...live(), budgets: [{ ...live().budgets[0], month: 'November' }] });
    let handed = false;
    const err = await restoreBackup(db.client, USER, otherFile(), () => { handed = true; }).catch(e => e);
    expect(err).toBeInstanceOf(RestoreError);
    expect(err.unchanged).toBe(true);
    expect(err.message).toMatch(/safety copy.*budget 1: month must be YYYY-MM\. Nothing was changed\.$/);
    expect(handed).toBe(false);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('says nothing was changed when saving the safety copy fails', async () => {
    const db = fakeDb(live());
    const err = await restoreBackup(db.client, USER, otherFile(), () => { throw new Error('disk full'); }).catch(e => e);
    expect(err.message).toBe('Could not save the safety copy of your current data (disk full). Nothing was changed.');
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('touches nothing when the file is invalid', async () => {
    const db = fakeDb(live());
    const before = JSON.stringify(db.tables);
    const file = { version: 2, accounts: [{ id: 'a', type: 'debit', balance: 1 }], transactions: [] };
    const err = await restoreBackup(db.client, USER, file).catch(e => e);
    expect(err).toBeInstanceOf(RestoreError);
    expect(err.unchanged).toBe(true);
    expect(err.message).toMatch(/account 1: needs a name\. Nothing was changed\.$/);
    await expect(restoreBackup(db.client, USER, { accounts: [] })).rejects.toThrow(/Invalid backup file.*Nothing was changed\.$/);
    expect(JSON.stringify(db.tables)).toBe(before);
    // Refused before the current data is even read.
    expect(db.selects).toEqual({});
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('refuses a backup too large for one request before reading or writing anything', async () => {
    const db = fakeDb(live());
    const big = { version: 2, ...live(), transactions: [{ ...tx('t1', 'a1', 10), note: 'x'.repeat(MAX_RESTORE_BYTES + 1024 * 1024) }] };
    const err = await restoreBackup(db.client, USER, big).catch(e => e);
    expect(err).toBeInstanceOf(RestoreError);
    expect(err.message).toBe('This backup is too large to restore (21.0 MB, the limit is 20.0 MB). Nothing was changed.');
    expect(db.selects).toEqual({});
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('says nothing was changed for every refusal the database or the API reports', async () => {
    const cases: Array<[FakeOpts['rpcAnswer'], RegExp]> = [
      [{ error: { message: 'Could not find the function public.restore_backup(payload) in the schema cache', code: 'PGRST202' }, status: 404 },
        /^The database does not have the restore function yet\. Run supabase\/pending_migrations\.sql/],
      [{ error: { message: '<html>413 Request Entity Too Large</html>' }, status: 413 }, /^The backup is too large for one request\./],
      [{ error: { message: 'canceling statement due to statement timeout', code: '57014' }, status: 500 }, /^The restore took too long/],
      [{ error: { message: 'not signed in', code: 'P0001' }, status: 400 }, /^Restore failed \(not signed in\)\./],
      [{ error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 }, /^Restore failed \(JWT expired\)\./],
    ];
    for (const [rpcAnswer, start] of cases) {
      const err = await restoreBackup(fakeDb(live(), { rpcAnswer }).client, USER, otherFile()).catch(e => e);
      expect(err).toBeInstanceOf(RestoreError);
      expect(err.unchanged, rpcAnswer!.error.message).toBe(true);
      expect(err.message).toMatch(start);
      expect(err.message).toMatch(/ Nothing was changed\.$/);
    }
  });

  it('does not claim nothing was changed when the answer from the database never arrives', async () => {
    const lost: Array<FakeOpts['rpcAnswer']> = [
      // What the client returns when the request fails in the browser.
      { error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 },
      // A gateway error says nothing about what the database did.
      { error: { message: 'Bad Gateway' }, status: 502 },
    ];
    for (const rpcAnswer of lost) {
      const err = await restoreBackup(fakeDb(live(), { rpcAnswer }).client, USER, otherFile()).catch(e => e);
      expect(err).toBeInstanceOf(RestoreError);
      expect(err.unchanged).toBe(false);
      expect(err.message).not.toMatch(/Nothing was changed/);
      expect(err.message).toMatch(/either fully replaced or not changed at all\.$/);
    }
    // A client that throws instead of returning an error is the same case.
    const db = fakeDb(live());
    (db.client as unknown as { rpc: unknown }).rpc = () => Promise.reject(new Error('socket closed'));
    const err = await restoreBackup(db.client, USER, otherFile()).catch(e => e);
    expect(err.unchanged).toBe(false);
    expect(err.message).toMatch(/socket closed/);
  });
});

describe('restorePayloadBytes', () => {
  const empty: RestorePayload = { accounts: [], balances: [], transactions: [], budgets: [], goals: [], goal_contributions: [] };

  it('counts bytes, not characters', () => {
    const ascii = restorePayloadBytes({ ...empty, accounts: [{ name: 'abcd' }] });
    const arabic = restorePayloadBytes({ ...empty, accounts: [{ name: '\u0645\u0637\u0639\u0645' }] });
    // Four Arabic letters are two bytes each.
    expect(arabic - ascii).toBe(4);
  });

  it('fits tens of thousands of ordinary transactions in one request', () => {
    const id = () => '11111111-2222-4333-8444-555555555555';
    const file = {
      version: 2,
      accounts: [{ ...account('a1', 'Debit', 0), id: id() }],
      transactions: Array.from({ length: 1000 }, (_, i) => ({
        ...tx(`t${i}`, id(), 125.5), category: 'Groceries', category_icon: 'shopping-cart', merchant: 'Carrefour City Centre',
        note: null, is_recurring: false, is_tracking_only: false, is_internal: false, dupe_dismissed: false,
        total_installments: null, current_installment: null, loan_total_amount: null, remaining_principal: null,
      })),
    };
    const { skippedTransactions: _skipped, ...payload } = prepareRestore(file, '99999999-2222-4333-8444-555555555555', id);
    const perRow = (restorePayloadBytes(payload) - restorePayloadBytes({ ...payload, transactions: [] })) / 1000;
    expect(perRow).toBeGreaterThan(250);
    expect(perRow).toBeLessThan(400);
    expect(Math.floor(MAX_RESTORE_BYTES / perRow)).toBeGreaterThan(50000);
  });
});
