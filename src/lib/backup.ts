// Backup and restore, kept out of the Settings page so it can be tested.
//
// Restore used to delete every row and then insert from the file, so one bad
// row left the account empty. Now: the file is checked before anything is
// touched, the current data is read from the server and handed back as a
// safety copy, and a failed restore puts that copy back.
import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_WRITE_COLUMNS } from '@/lib/dbSchema';

export const PAGE_SIZE = 1000;

type Row = Record<string, unknown>;
type QueryError = { message: string };
type PageResult<T> = { data: T[] | null; error: QueryError | null; count?: number | null };

/**
 * Read every row of a query, one page at a time. PostgREST returns at most
 * 1,000 rows per request and says nothing about the rest, so a plain select
 * silently loses rows past that. Ask for `count: 'exact'` in the query to be
 * safe against a server page size smaller than `size`.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  size = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error, count } = await page(rows.length, rows.length + size - 1);
    if (error) throw error;
    const got = data ?? [];
    rows.push(...got);
    if (got.length === 0) return rows;
    if (count != null ? rows.length >= count : got.length < size) return rows;
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
  const read = (name: BackupTable) => fetchAllRows<Row>((from, to) =>
    table(client, name).select('*', { count: 'exact' }).eq('user_id', userId).order('id').range(from, to));
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
}

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isAmount = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0;

/** Keep only the columns the app writes, so a column from a newer or older schema can't break the insert. */
function pick(name: string, row: Row): Row {
  const out: Row = {};
  for (const col of APP_WRITE_COLUMNS[name] ?? []) {
    if (row[col] !== undefined) out[col] = row[col];
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
): PreparedRestore {
  const file = data as Partial<Record<BackupTable, unknown>> & { version?: unknown };
  if (!file || typeof file !== 'object' || !file.version || !Array.isArray(file.accounts) || !Array.isArray(file.transactions)) {
    throw new Error('Invalid backup file: missing version, accounts or transactions.');
  }
  const v1 = Number(file.version) < 2;
  // Oldest first, so lists that sort by creation time keep their order.
  const byCreated = (a: Row, b: Row) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  const rows = (name: BackupTable): Row[] => {
    const list = Array.isArray(file[name]) ? file[name] as Row[] : [];
    return v1 ? list.map(r => toRow(name, r)) : [...list].sort(byCreated);
  };

  const problems: string[] = [];
  const bad = (what: string, i: number, why: string) => problems.push(`${what} ${i + 1}: ${why}`);

  // New ids for everything, so a file from another account (or one whose rows
  // still exist somewhere) can never collide.
  const accountIds = new Map<string, string>();
  const accounts: Row[] = [];
  const balances: PreparedRestore['balances'] = [];
  rows('accounts').forEach((a, i) => {
    if (!a.name || !['cash', 'debit', 'credit'].includes(String(a.type))) return bad('account', i, 'needs a name and a type');
    if (!Number.isFinite(Number(a.balance))) return bad('account', i, 'balance is not a number');
    const id = newId();
    accountIds.set(String(a.id), id);
    // Starts at 0: inserting the transactions replays them onto the balance
    // through the database trigger. The exported balance is set afterwards.
    accounts.push({ ...pick('accounts', a), id, user_id: userId, balance: 0 });
    balances.push({ id, balance: Number(a.balance) });
  });

  let skippedTransactions = 0;
  const transactions: Row[] = [];
  rows('transactions').forEach((t, i) => {
    const accountId = accountIds.get(String(t.account_id));
    if (!accountId) { skippedTransactions++; return; }
    if (!['expense', 'income', 'transfer'].includes(String(t.type))) return bad('transaction', i, 'unknown type');
    if (!isAmount(t.amount)) return bad('transaction', i, 'amount must be above 0');
    if (!isDate(t.date)) return bad('transaction', i, 'date must be YYYY-MM-DD');
    if (!t.category) return bad('transaction', i, 'no category');
    transactions.push({ ...pick('transactions', t), user_id: userId, account_id: accountId });
  });

  const budgets: Row[] = [];
  rows('budgets').forEach((b, i) => {
    if (!b.category || !isAmount(b.amount) || !/^\d{4}-\d{2}$/.test(String(b.month))) return bad('budget', i, 'needs a category, an amount and a month');
    budgets.push({ ...pick('budgets', b), user_id: userId });
  });

  const goalIds = new Map<string, string>();
  const goals: Row[] = [];
  rows('goals').forEach((g, i) => {
    if (!g.name || !isAmount(g.target_amount)) return bad('goal', i, 'needs a name and a target');
    const id = newId();
    goalIds.set(String(g.id), id);
    goals.push({ ...pick('goals', g), id, user_id: userId });
  });

  const goal_contributions: Row[] = [];
  for (const c of rows('goal_contributions')) {
    const goalId = goalIds.get(String(c.goal_id));
    if (!goalId || !Number.isFinite(Number(c.amount))) continue;
    goal_contributions.push({
      ...pick('goal_contributions', c), user_id: userId, goal_id: goalId,
      // The log shows this as the contribution's date.
      ...(typeof c.created_at === 'string' && { created_at: c.created_at }),
    });
  }

  if (problems.length) {
    const more = problems.length > 3 ? ` (and ${problems.length - 3} more)` : '';
    throw new Error(`Backup file has rows that can't be restored: ${problems.slice(0, 3).join('; ')}${more}. Nothing was changed.`);
  }
  return { accounts, balances, transactions, budgets, goals, goal_contributions, skippedTransactions };
}

// ─── Writing ──────────────────────────────────────────────────────────────────

const INSERT_CHUNK = 500;

async function insertAll(client: SupabaseClient, name: string, rows: Row[], chunk = INSERT_CHUNK) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await table(client, name).insert(rows.slice(i, i + chunk) as never);
    if (error) throw error;
  }
}

/** Replace everything the user owns with the prepared rows. */
export async function applyRestore(client: SupabaseClient, userId: string, prep: PreparedRestore) {
  // One table at a time: deleting accounts while transactions are going can
  // deadlock on the balance trigger.
  for (const name of ['goal_contributions', 'transactions', 'budgets', 'goals', 'accounts']) {
    const { error } = await table(client, name).delete().eq('user_id', userId);
    if (error) throw error;
  }
  // Accounts and goals go in one by one: rows from a single insert share a
  // creation time, and both lists are ordered by it.
  await insertAll(client, 'accounts', prep.accounts, 1);
  await insertAll(client, 'transactions', prep.transactions);
  for (const { id, balance } of prep.balances) {
    const { error } = await table(client, 'accounts').update({ balance } as never).eq('id', id);
    if (error) throw error;
  }
  await insertAll(client, 'budgets', prep.budgets);
  await insertAll(client, 'goals', prep.goals, 1);
  try {
    await insertAll(client, 'goal_contributions', prep.goal_contributions);
  } catch {
    // Keeping the original dates is a nicety; the log itself matters more.
    await table(client, 'goal_contributions').delete().eq('user_id', userId);
    await insertAll(client, 'goal_contributions', prep.goal_contributions.map(({ created_at: _drop, ...c }) => c));
  }
}

export class RestoreError extends Error {
  /** True when the data from before the restore was put back. */
  readonly rolledBack: boolean;
  constructor(cause: unknown, rolledBack: boolean) {
    super(cause instanceof Error ? cause.message : (cause as QueryError | null)?.message ?? 'Unknown error');
    this.name = 'RestoreError';
    this.rolledBack = rolledBack;
  }
}

export interface RestoreResult {
  accounts: number;
  transactions: number;
  skippedTransactions: number;
}

/**
 * Restore a parsed backup file. `onSnapshot` receives the user's current data
 * before anything is deleted; save it. If the restore fails part-way, that
 * snapshot is written back and a RestoreError says whether that worked.
 */
export async function restoreBackup(
  client: SupabaseClient,
  userId: string,
  data: unknown,
  onSnapshot: (snapshot: BackupV2) => void = () => {},
): Promise<RestoreResult> {
  const prep = prepareRestore(data, userId);
  const snapshot = await exportBackup(client, userId);
  onSnapshot(snapshot);
  try {
    await applyRestore(client, userId, prep);
  } catch (err) {
    let rolledBack = true;
    try {
      await applyRestore(client, userId, prepareRestore(snapshot, userId));
    } catch {
      rolledBack = false;
    }
    throw new RestoreError(err, rolledBack);
  }
  return { accounts: prep.accounts.length, transactions: prep.transactions.length, skippedTransactions: prep.skippedTransactions };
}
