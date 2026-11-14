// Rules for writing transaction rows. Pure, so they are unit-tested.

/**
 * Money is saved in whole cents. A difference such as 1234.56 - 1000.1 is
 * 234.45999999999992 in floating point; unrounded, the tail lands in the
 * amount column and then in the account balance.
 */
export const roundAmount = (n: number) => Math.round(n * 100) / 100;

/** roundAmount for a column that can be empty. */
export const roundAmountOrNull = (n: number | null | undefined) => (n == null ? null : roundAmount(n));

/**
 * A new id for plan_id / transfer_id. crypto.randomUUID is there only on
 * https and localhost; opened over plain http (a phone on the local network)
 * it is missing and every transfer would fail. getRandomValues is always there.
 */
export function newUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// plan_id and transfer_id come with a migration that is applied by hand.
const LINK_COLUMNS = ['plan_id', 'transfer_id'];

interface WriteError { code?: string; message?: string }

/**
 * True when a write was refused because plan_id or transfer_id is not on the
 * database yet. PostgREST answers PGRST204 ("Could not find the 'plan_id'
 * column of 'transactions' in the schema cache"); Postgres itself, 42703.
 */
export function isMissingLinkColumn(error: WriteError | null | undefined): boolean {
  if (!error || (error.code !== 'PGRST204' && error.code !== '42703')) return false;
  return LINK_COLUMNS.some(c => (error.message ?? '').includes(c));
}

/** The same row without plan_id and transfer_id. */
export function withoutLinkColumns<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const c of LINK_COLUMNS) delete out[c];
  return out as T;
}

/**
 * Run a write. If the database has no plan_id / transfer_id yet, run it again
 * without them: the row is saved and the app groups and pairs it the old way.
 * A missing column must not stop "New Transaction" or a transfer from saving.
 * `write` gets a function to pass each row through before sending it.
 */
export async function retryWithoutLinks<R extends { error: WriteError | null }>(
  write: (prep: <T extends object>(row: T) => T) => PromiseLike<R>,
): Promise<R> {
  const first = await write(row => row);
  if (!isMissingLinkColumn(first.error)) return first;
  return write(withoutLinkColumns);
}
