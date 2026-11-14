// Backup and restore, kept out of the Settings page so it can be tested.
//
// Restore used to delete every row and then insert from the file, so one bad
// row left the account empty. Now: the file is checked against the database's
// own rules before anything is touched, the current data is read from the
// server and handed back as a safety copy, and the replace itself is one
// database transaction (the restore_backup function), so it either all
// happens or nothing changes.
import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_WRITE_COLUMNS } from '@/lib/dbSchema';

export const PAGE_SIZE = 1000;

type Row = Record<string, unknown>;
type QueryError = { message: string };
type PageResult<T> = { data: T[] | null; error: QueryError | null; count?: number | null };

/** The message of anything a failed call can hand back. Supabase errors are plain objects, not Error instances. */
export function errorMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message.trim()) return message;
  return typeof err === 'string' && err.trim() ? err : 'no reason given';
}

const idOf = (row: unknown): unknown =>
  row !== null && typeof row === 'object' ? (row as { id?: unknown }).id : undefined;

/** How many times fetchAllRows starts again when the list changes under it. */
const MAX_READS = 3;

/**
 * Read every row of a query, one page at a time. PostgREST returns at most
 * 1,000 rows per request and says nothing about the rest, so a plain select
 * silently loses rows past that. Ask for `count: 'exact'` in the query to be
 * safe against a server page size smaller than `size`.
 *
 * Pages are cut by row position, so a row added between two requests pushes
 * an old row onto the next page (it arrives twice) and a row removed pulls
 * one off it (it never arrives). No row is returned twice: repeats are
 * dropped by id. A count that changes between pages means the list moved, so
 * the read starts again; after MAX_READS tries the last read is used.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  size = PAGE_SIZE,
): Promise<T[]> {
  for (let read = 1; ; read++) {
    const rows: T[] = [];
    const seen = new Set<unknown>();
    // Rows the server has sent, repeats included: the position of the next page.
    let sent = 0;
    let total: number | null = null;
    let moved = false;
    for (;;) {
      const { data, error, count } = await page(sent, sent + size - 1);
      if (error) throw new Error(errorMessage(error));
      const got = data ?? [];
      if (count != null) {
        if (total != null && count !== total && read < MAX_READS) { moved = true; break; }
        total = count;
      }
      sent += got.length;
      for (const row of got) {
        const id = idOf(row);
        if (id !== undefined) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        rows.push(row);
      }
      if (got.length === 0) break;
      if (total != null ? sent >= total : got.length < size) break;
    }
    if (!moved) return rows;
  }
}

/**
 * Read every row in id order, each page starting after the last id of the one
 * before. A row added or removed between two requests cannot repeat or hide
 * another row, because no page depends on how many rows came before it.
 * With `count: 'exact'` the count is the rows left from this page on.
 */
export async function fetchAllById<T>(
  page: (afterId: string | null, limit: number) => PromiseLike<PageResult<T>>,
  size = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let last: string | null = null;
  for (;;) {
    const { data, error, count } = await page(last, size);
    if (error) throw new Error(errorMessage(error));
    const got = data ?? [];
    rows.push(...got);
    // No count: only an empty page proves the end, the server may cap pages below `size`.
    if (got.length === 0 || (count != null && got.length >= count)) return rows;
    const next = String(idOf(got[got.length - 1]));
    // A query that ignores the "after" id would loop forever.
    if (next === last) throw new Error('Paging did not move past the last row.');
    last = next;
  }
}

export const BACKUP_TABLES = ['accounts', 'transactions', 'budgets', 'goals', 'goal_contributions'] as const;
export type BackupTable = typeof BACKUP_TABLES[number];

export interface BackupV2 {
  version: 2;
  exportedAt: string;
  accounts: Row[];
  transactions: Row[];
  budgets: Row[];
  goals: Row[];
  goal_contributions: Row[];
}

// The generated types don't know every table and column.
const table = (client: SupabaseClient, name: string) =>
  client.from(name as never) as ReturnType<SupabaseClient['from']>;

/** Every row the user owns, straight from the server (not just what the app has loaded). */
export async function exportBackup(client: SupabaseClient, userId: string): Promise<BackupV2> {
  // By id, not by position: a write from another device or the bot while the
  // pages load must not put a row in the file twice or leave one out.
  const read = (name: BackupTable) => fetchAllById<Row>((afterId, limit) => {
    const mine = table(client, name).select('*', { count: 'exact' }).eq('user_id', userId);
    return (afterId ? mine.gt('id', afterId) : mine).order('id').limit(limit);
  });
  const [accounts, transactions, budgets, goals, goal_contributions] = await Promise.all(BACKUP_TABLES.map(read));
  return { version: 2, exportedAt: new Date().toISOString(), accounts, transactions, budgets, goals, goal_contributions };
}

// ─── Reading a backup file ────────────────────────────────────────────────────

// Version 1 files hold the app's camelCase objects, not database rows.
const V1_KEYS: Record<string, Record<string, string>> = {
  accounts: {
    creditLimit: 'credit_limit', dueDate: 'due_date', statementDate: 'statement_date',
    statementTotalDue: 'statement_total_due', statementMinDue: 'statement_min_due',
    statementDueOn: 'statement_due_on', excludeFromSpendable: 'exclude_from_spendable',
  },
  transactions: {
    accountId: 'account_id', categoryIcon: 'category_icon', isRecurring: 'is_recurring',
    totalInstallments: 'total_installments', currentInstallment: 'current_installment',
    loanTotalAmount: 'loan_total_amount', isTrackingOnly: 'is_tracking_only', isInternal: 'is_internal',
    isPending: 'is_pending', remainingPrincipal: 'remaining_principal', dupeDismissed: 'dupe_dismissed',
  },
  budgets: { categoryIcon: 'category_icon', isFixed: 'is_fixed' },
  goals: { targetAmount: 'target_amount', savedAmount: 'saved_amount' },
};

const toRow = (name: string, obj: Row): Row =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [V1_KEYS[name]?.[k] ?? k, v]));

export interface PreparedRestore {
  accounts: Row[];
  /** The balance each account had in the backup, set after its transactions are replayed. */
  balances: Array<{ id: string; balance: number }>;
  transactions: Row[];
  budgets: Row[];
  goals: Row[];
  goal_contributions: Row[];
  /** Transactions left out because their account isn't in the file. */
  skippedTransactions: number;
  /** Weekly budgets in the file that were turned into monthly ones. */
  weeklyBudgets: number;
}

// ─── The database's rules ─────────────────────────────────────────────────────
//
// Every CHECK, NOT NULL and UNIQUE rule the five tables carry (see
// supabase/migrations), repeated here so a file the database would refuse is
// refused first, with the row named. The aim is to accept exactly what the
// database accepts. A stricter rule here once made the user's own export
// impossible to restore: the database allows an amount of 0, this file did not.

type Test = (v: unknown) => boolean;
const isNum: Test = v => typeof v === 'number' && Number.isFinite(v);
const min = (n: number): Test => v => isNum(v) && (v as number) >= n;
const above = (n: number): Test => v => isNum(v) && (v as number) > n;
const isInt: Test = v => isNum(v) && Number.isInteger(v);
const isDay: Test = v => isInt(v) && (v as number) >= 1 && (v as number) <= 31;
const isBool: Test = v => typeof v === 'boolean';
const isText: Test = v => typeof v === 'string';
// length(btrim(x)) > 0. btrim strips spaces only, so a tab is not blank to the database.
const notBlank: Test = v => typeof v === 'string' && v.replace(/^ +| +$/g, '') !== '';
const oneOf = (...list: string[]): Test => v => typeof v === 'string' && list.includes(v);
const isUuid: Test = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isMonth: Test = v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
/** A real calendar date, YYYY-MM-DD. The shape alone lets 2026-02-31 through. */
const isDate: Test = v => {
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  return y >= 1 && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
};
const isTimestamp: Test = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v) && !Number.isNaN(Date.parse(v));
/** An empty value is fine: the column is optional or has a default. */
const opt = (test: Test): Test => v => v == null || test(v);

type Rule = [column: string, test: Test, why: string];

const RULES: Record<BackupTable, Rule[]> = {
  accounts: [
    ['name', notBlank, 'needs a name'],
    ['type', oneOf('cash', 'debit', 'credit'), 'type must be cash, debit or credit'],
    ['balance', isNum, 'balance is not a number'],
    ['credit_limit', opt(min(0)), 'credit limit must be 0 or more'],
    ['apr', opt(min(0)), 'APR must be 0 or more'],
    ['statement_total_due', opt(min(0)), 'statement total must be 0 or more'],
    ['statement_min_due', opt(min(0)), 'statement minimum must be 0 or more'],
    ['due_date', opt(isDay), 'due day must be 1 to 31'],
    ['statement_date', opt(isDay), 'statement day must be 1 to 31'],
    ['statement_due_on', opt(isDate), 'statement due date must be a real date, YYYY-MM-DD'],
    ['exclude_from_spendable', opt(isBool), 'exclude_from_spendable must be true or false'],
    ['currency', opt(isText), 'currency must be text'],
    ['icon', opt(isText), 'icon must be text'],
  ],
  transactions: [
    ['type', oneOf('expense', 'income', 'transfer'), 'type must be expense, income or transfer'],
    ['amount', min(0), 'amount must be 0 or more'],
    ['date', isDate, 'date must be a real date, YYYY-MM-DD'],
    ['category', notBlank, 'needs a category'],
    ['merchant', notBlank, 'needs a merchant'],
    ['total_installments', opt(isInt), 'instalment count must be a whole number'],
    ['current_installment', opt(isInt), 'instalments paid must be a whole number'],
    ['loan_total_amount', opt(isNum), 'loan total is not a number'],
    ['remaining_principal', opt(min(0)), 'remaining principal must be 0 or more'],
    ['is_recurring', opt(isBool), 'is_recurring must be true or false'],
    ['is_tracking_only', opt(isBool), 'is_tracking_only must be true or false'],
    ['is_internal', opt(isBool), 'is_internal must be true or false'],
    ['is_pending', opt(isBool), 'is_pending must be true or false'],
    ['dupe_dismissed', opt(isBool), 'dupe_dismissed must be true or false'],
    ['plan_id', opt(isUuid), 'plan_id is not an id'],
    ['transfer_id', opt(isUuid), 'transfer_id is not an id'],
    ['currency', opt(isText), 'currency must be text'],
    ['category_icon', opt(isText), 'category icon must be text'],
    ['note', opt(isText), 'note must be text'],
  ],
  budgets: [
    ['category', notBlank, 'needs a category'],
    ['amount', min(0), 'amount must be 0 or more'],
    // The database takes any text here; the app only ever writes and reads YYYY-MM.
    ['month', isMonth, 'month must be YYYY-MM'],
    ['period', opt(oneOf('monthly', 'weekly')), 'period must be monthly or weekly'],
    ['is_fixed', opt(isBool), 'is_fixed must be true or false'],
    ['category_icon', opt(isText), 'category icon must be text'],
  ],
  goals: [
    ['name', notBlank, 'needs a name'],
    ['type', isText, 'needs a type'],
    ['target_amount', above(0), 'target must be above 0'],
    ['saved_amount', opt(min(0)), 'saved amount must be 0 or more'],
    ['status', opt(oneOf('active', 'completed', 'paused')), 'status must be active, completed or paused'],
    ['deadline', opt(isDate), 'deadline must be a real date, YYYY-MM-DD'],
    ['icon', opt(isText), 'icon must be text'],
  ],
  goal_contributions: [
    ['amount', above(0), 'amount must be above 0'],
    ['note', opt(isText), 'note must be text'],
  ],
};

/** The first rule the row breaks, or null. */
const broken = (name: BackupTable, row: Row): string | null =>
  RULES[name].find(([column, test]) => !test(row[column]))?.[2] ?? null;

/**
 * The instalment rule (transactions_installments_valid) the way the database
 * reads it: both values empty, or a plan of 1 or more with 0 to `total` paid.
 * 0 paid is valid: a plan whose first payment is still to come. A comparison
 * with an empty value is "unknown", which a CHECK lets through, so a value on
 * its own only fails its own half of the rule.
 */
export function instalmentsOk(total: unknown, current: unknown): boolean {
  const t = total == null ? null : Number(total);
  const c = current == null ? null : Number(current);
  if (t !== null && !(t > 0)) return false;
  if (c !== null && !(c >= 0)) return false;
  return t === null || c === null || c <= t;
}

/**
 * Weekly budgets are retired. The database turned the ones it held into
 * monthly budgets with this sum (52 weeks over 12 months, to the cent), so a
 * weekly budget in an older file gets the same.
 */
export const weeklyToMonthly = (amount: number) => Math.round((amount * 52 / 12) * 100) / 100;

// Columns the restore carries on top of the app's write list. plan_id ties the
// rows of one instalment plan together and transfer_id the two halves of a
// transfer: left out, two plans at one merchant would merge after a restore.
const CARRIED: Record<string, string[]> = { transactions: ['plan_id', 'transfer_id'] };

/**
 * Keep only the columns the app writes, so a column from a newer or older
 * schema can't break the insert. Empty values are left out: for the database
 * an absent column and a null one are the same, except where the column has a
 * default, and there the default is what's wanted.
 */
function pick(name: string, row: Row): Row {
  const out: Row = {};
  for (const col of [...(APP_WRITE_COLUMNS[name] ?? []), ...(CARRIED[name] ?? [])]) {
    if (row[col] != null) out[col] = row[col];
  }
  return out;
}

/**
 * Turn a parsed backup file into rows ready to insert. Throws, with the reason,
 * if the file can't be restored. Nothing is written here.
 */
export function prepareRestore(
  data: unknown,
  userId: string,
  newId: () => string = () => crypto.randomUUID(),
  now: number = Date.now(),
): PreparedRestore {
  const file = data as Partial<Record<BackupTable, unknown>> & { version?: unknown };
  if (!file || typeof file !== 'object' || !file.version || !Array.isArray(file.accounts) || !Array.isArray(file.transactions)) {
    throw new Error('Invalid backup file: missing version, accounts or transactions.');
  }
  const v1 = Number(file.version) < 2;
  // `n` is the row's place in the file, for messages: the sort would change it.
  type Entry = { row: Row; n: number };
  // Oldest first, so lists that sort by creation time keep their order.
  const byCreated = (a: Entry, b: Entry) => String(a.row.created_at ?? '').localeCompare(String(b.row.created_at ?? ''));
  const rows = (name: BackupTable): Entry[] => {
    const list = (Array.isArray(file[name]) ? file[name] as unknown[] : [])
      .map((r, i) => ({ row: (r !== null && typeof r === 'object' ? r : {}) as Row, n: i + 1 }));
    return v1 ? list.map(e => ({ ...e, row: toRow(name, e.row) })) : list.sort(byCreated);
  };

  const problems: string[] = [];
  const bad = (what: string, n: number, why: string) => { problems.push(`${what} ${n}: ${why}`); };
  // Accounts and goals are listed by creation time. The restore is one
  // database transaction, where every row would get the same time, so each
  // row carries its own: the one in the file, or one a millisecond apart.
  let made = 0;
  const createdAt = (row: Row) => (isTimestamp(row.created_at) ? row.created_at : new Date(now + made++).toISOString());

  // New ids for everything, so a file from another account (or one whose rows
  // still exist somewhere) can never collide.
  const accountIds = new Map<string, string>();
  const accounts: Row[] = [];
  const balances: PreparedRestore['balances'] = [];
  for (const { row: a, n } of rows('accounts')) {
    const why = broken('accounts', a);
    if (why) { bad('account', n, why); continue; }
    const id = newId();
    accountIds.set(String(a.id), id);
    // Starts at 0: inserting the transactions replays them onto the balance
    // through the database trigger. The exported balance is set afterwards.
    accounts.push({ ...pick('accounts', a), id, user_id: userId, balance: 0, created_at: createdAt(a) });
    balances.push({ id, balance: a.balance as number });
  }

  let skippedTransactions = 0;
  const transactions: Row[] = [];
  for (const { row: t, n } of rows('transactions')) {
    const accountId = accountIds.get(String(t.account_id));
    if (!accountId) { skippedTransactions++; continue; }
    const why = broken('transactions', t)
      ?? (instalmentsOk(t.total_installments, t.current_installment) ? null : 'instalments paid must be between 0 and the instalment count');
    if (why) { bad('transaction', n, why); continue; }
    transactions.push({ ...pick('transactions', t), user_id: userId, account_id: accountId });
  }

  const budgets: Row[] = [];
  let weeklyBudgets = 0;
  // One budget per category and month (uniq_budgets_user_category_month).
  const budgetAt = new Map<string, number>();
  for (const { row: b, n } of rows('budgets')) {
    const why = broken('budgets', b);
    if (why) { bad('budget', n, why); continue; }
    const key = JSON.stringify([b.category, b.month]);
    const first = budgetAt.get(key);
    if (first !== undefined) { bad('budget', n, `same category and month as budget ${first}`); continue; }
    budgetAt.set(key, n);
    const weekly = b.period === 'weekly';
    if (weekly) weeklyBudgets++;
    const amount = weekly ? weeklyToMonthly(b.amount as number) : b.amount;
    budgets.push({ ...pick('budgets', b), amount, period: 'monthly', user_id: userId });
  }

  const goalIds = new Map<string, string>();
  const goals: Row[] = [];
  for (const { row: g, n } of rows('goals')) {
    const why = broken('goals', g);
    if (why) { bad('goal', n, why); continue; }
    const id = newId();
    goalIds.set(String(g.id), id);
    goals.push({ ...pick('goals', g), id, user_id: userId, created_at: createdAt(g) });
  }

  const goal_contributions: Row[] = [];
  for (const { row: c, n } of rows('goal_contributions')) {
    const goalId = goalIds.get(String(c.goal_id));
    // A contribution to a goal that isn't in the file has nothing to attach to.
    if (!goalId) continue;
    const why = broken('goal_contributions', c);
    if (why) { bad('goal contribution', n, why); continue; }
    goal_contributions.push({
      ...pick('goal_contributions', c), user_id: userId, goal_id: goalId,
      // The log shows this as the contribution's date.
      ...(isTimestamp(c.created_at) && { created_at: c.created_at }),
    });
  }

  if (problems.length) {
    const more = problems.length > 3 ? ` (and ${problems.length - 3} more)` : '';
    throw new Error(`Backup file has rows that can't be restored: ${problems.slice(0, 3).join('; ')}${more}.`);
  }
  return { accounts, balances, transactions, budgets, goals, goal_contributions, skippedTransactions, weeklyBudgets };
}

// ─── Writing ──────────────────────────────────────────────────────────────────

/** What the restore_backup database function takes: the prepared rows, keyed by table. */
export type RestorePayload = Omit<PreparedRestore, 'skippedTransactions' | 'weeklyBudgets'>;

/**
 * The largest restore request the app sends. The whole restore has to be one
 * request, because splitting it would split the transaction. A transaction
 * row is about 370 bytes of JSON (545 with an instalment plan and a note), so
 * this is roughly 50,000 transactions. Supabase documents no body limit for
 * this API, so the number is this app's own ceiling, not the server's: past
 * it the file is refused here with a plain message, before anything is read
 * or written. A smaller limit on the server shows as "too large for one
 * request", also with nothing changed.
 */
export const MAX_RESTORE_BYTES = 20 * 1024 * 1024;

/** Size of the request body for a payload, in bytes (not characters: an icon or an Arabic merchant name is several bytes). */
export const restorePayloadBytes = (payload: RestorePayload): number =>
  new TextEncoder().encode(JSON.stringify({ payload })).length;

const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

const NOTHING_CHANGED = 'Nothing was changed.';

export class RestoreError extends Error {
  /**
   * True when it is certain that no row was changed: the failure came before
   * the database call, or the database refused the call and rolled it back.
   * False only when the answer to the database call never arrived.
   */
  readonly unchanged: boolean;
  constructor(message: string, unchanged: boolean) {
    super(unchanged ? `${message} ${NOTHING_CHANGED}` : message);
    this.name = 'RestoreError';
    this.unchanged = unchanged;
  }
}

type RpcError = { message?: string; code?: string };

/** Turn a failed restore_backup call into the error to show. */
function rpcFailure(error: RpcError, status: number): RestoreError {
  const reason = errorMessage(error);
  // The database (or the API in front of it) answered with a refusal. The
  // function is one transaction, so a refusal means every row is as it was.
  const refused = (status >= 400 && status < 500) || (typeof error.code === 'string' && error.code !== '');
  if (!refused) {
    // No answer (offline, tab asleep) or a bare gateway error: the request may
    // have reached the database and finished there.
    return new RestoreError(
      `The connection dropped during the restore (${reason}), so the result is not known. Your data is either fully replaced or not changed at all.`,
      false,
    );
  }
  if (error.code === 'PGRST202' || error.code === '42883') {
    return new RestoreError('The database does not have the restore function yet. Run supabase/pending_migrations.sql in the Supabase SQL editor.', true);
  }
  if (status === 413) return new RestoreError('The backup is too large for one request.', true);
  if (error.code === '57014') return new RestoreError('The restore took too long and the database stopped it.', true);
  return new RestoreError(`Restore failed (${reason}).`, true);
}

export interface RestoreResult {
  accounts: number;
  transactions: number;
  skippedTransactions: number;
  /** Weekly budgets whose amount was changed to the monthly sum. The user is told: a stored figure changed. */
  weeklyBudgets: number;
}

/**
 * Restore a parsed backup file. `onSnapshot` receives the user's current data
 * before the database is touched; save it. Always throws a RestoreError, whose
 * message is a full sentence to show and whose `unchanged` says whether it is
 * certain that nothing was changed.
 *
 * The write is one call to the restore_backup database function, which
 * deletes and inserts inside one transaction. It used to be dozens of
 * requests from the browser, so a closed tab or a refused row part-way left
 * the account half-written, and putting the old data back depended on the
 * same browser staying alive.
 */
export async function restoreBackup(
  client: SupabaseClient,
  userId: string,
  data: unknown,
  onSnapshot: (snapshot: BackupV2) => void = () => {},
): Promise<RestoreResult> {
  // Everything down to the database call only reads, so a failure in it
  // leaves the account exactly as it was, and the message says so.
  let payload: RestorePayload;
  let skippedTransactions: number;
  let weeklyBudgets: number;
  let bytes: number;
  try {
    ({ skippedTransactions, weeklyBudgets, ...payload } = prepareRestore(data, userId));
    bytes = restorePayloadBytes(payload);
  } catch (err) {
    throw new RestoreError(errorMessage(err), true);
  }
  if (bytes > MAX_RESTORE_BYTES) {
    throw new RestoreError(`This backup is too large to restore (${megabytes(bytes)} MB, the limit is ${megabytes(MAX_RESTORE_BYTES)} MB).`, true);
  }

  let snapshot: BackupV2;
  try {
    snapshot = await exportBackup(client, userId);
  } catch (err) {
    throw new RestoreError(`Could not read your current data to make the safety copy (${errorMessage(err)}).`, true);
  }
  // The safety copy is the only way back after a restore, so it has to be a
  // file this same check accepts. Better to stop now than to find that out later.
  try {
    prepareRestore(snapshot, userId);
  } catch (err) {
    throw new RestoreError(`Your current data could not be saved as a safety copy that works. ${errorMessage(err)}`, true);
  }
  try {
    onSnapshot(snapshot);
  } catch (err) {
    throw new RestoreError(`Could not save the safety copy of your current data (${errorMessage(err)}).`, true);
  }

  let answer: { data: unknown; error: RpcError | null; status: number };
  try {
    answer = await client.rpc('restore_backup', { payload });
  } catch (err) {
    answer = { data: null, error: { message: errorMessage(err) }, status: 0 };
  }
  if (answer.error) throw rpcFailure(answer.error, answer.status);

  // The function reports what it inserted; fall back to what was sent.
  const done = (answer.data ?? {}) as { accounts?: unknown; transactions?: unknown };
  return {
    accounts: typeof done.accounts === 'number' ? done.accounts : payload.accounts.length,
    transactions: typeof done.transactions === 'number' ? done.transactions : payload.transactions.length,
    skippedTransactions,
    weeklyBudgets,
  };
}
