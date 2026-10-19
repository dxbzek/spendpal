// Every column the app writes, per table, and a check of that list against
// the live database. Migrations here are applied by hand from
// supabase/pending_migrations.sql, so a missed one used to surface only as
// "New Transaction" failing. This makes it a named error at startup instead.
//
// Kept honest by src/test/dbSchema.test.ts: every key the code writes must be
// listed here, and every column listed must be created by a migration that is
// also in pending_migrations.sql. CI runs the live check too (scripts/check-schema.mjs).
import type { SupabaseClient } from '@supabase/supabase-js';
import columns from './dbWriteColumns.json';

export const APP_WRITE_COLUMNS: Record<string, string[]> = columns;

export interface ProbeResult {
  /** "table.column" entries the database doesn't have. */
  missing: string[];
}

// PostgREST passes Postgres' undefined_column through when a select names a
// column the table doesn't have. Anything else (offline, auth) isn't schema drift.
const isMissingColumn = (e: { code?: string } | null) => e?.code === '42703';

type Probe = (table: string, select: string) => Promise<{ error: { code?: string } | null }>;

/** Which of the app's columns the database is missing. Network and auth errors count as "unknown", not missing. */
export async function findMissingColumns(probe: Probe, tables = APP_WRITE_COLUMNS): Promise<ProbeResult> {
  const missing: string[] = [];
  await Promise.all(Object.entries(tables).map(async ([table, cols]) => {
    const { error } = await probe(table, cols.join(','));
    if (!isMissingColumn(error)) return;
    // The error names only the first missing column; ask one at a time to list them all.
    const each = await Promise.all(cols.map(async c => ({ c, error: (await probe(table, c)).error })));
    for (const { c, error: e } of each) if (isMissingColumn(e)) missing.push(`${table}.${c}`);
  }));
  return { missing: missing.sort() };
}

/** Probe through the signed-in client: `select=<cols>&limit=0` reads no rows. */
export const supabaseProbe = (client: SupabaseClient): Probe => async (table, select) => {
  // Table names come from the list above; the generated types don't know every table.
  const { error } = await (client.from(table as never) as ReturnType<SupabaseClient['from']>).select(select).limit(0);
  return { error };
};
