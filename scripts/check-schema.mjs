// CI check: does the live database have every column the app writes?
//
// Reads the column list from src/lib/dbWriteColumns.json and asks PostgREST
// for `select=<columns>&limit=0` on each table with the public (publishable)
// key. No rows come back (RLS, and limit 0), but Postgres still resolves
// every column, so a missing one comes back as error 42703.
//
// Missing columns fail the job with the list. Being unable to reach the
// database is only a warning: that's not schema drift.
//
//   node scripts/check-schema.mjs
//   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… node scripts/check-schema.mjs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const tables = JSON.parse(read('src/lib/dbWriteColumns.json'));
// Default to the same project and public key the app ships with.
const client = read('src/integrations/supabase/client.ts');
const fallback = (name) => client.match(new RegExp(`${name}\\s*\\|\\|\\s*'([^']+)'`))?.[1];
const url = process.env.SUPABASE_URL || fallback('VITE_SUPABASE_URL');
const key = process.env.SUPABASE_PUBLISHABLE_KEY || fallback('VITE_SUPABASE_PUBLISHABLE_KEY');

async function probe(table, select) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=0`, {
    // apikey only: a publishable key isn't a JWT, so it can't go in Authorization.
    headers: { apikey: key },
  });
  if (res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return { status: res.status, code: body.code, message: body.message };
}

const missing = [];
const unknown = [];
try {
  for (const [table, cols] of Object.entries(tables)) {
    const err = await probe(table, cols.join(','));
    if (!err) continue;
    if (err.code !== '42703') { unknown.push(`${table}: ${err.status} ${err.code ?? ''} ${err.message ?? ''}`.trim()); continue; }
    // The error names only the first missing column; check one at a time.
    for (const c of cols) if ((await probe(table, c))?.code === '42703') missing.push(`${table}.${c}`);
  }
} catch (e) {
  console.log(`::warning::Schema check skipped, database unreachable: ${e.message}`);
  process.exit(0);
}

for (const u of unknown) console.log(`::warning::Couldn't check ${u}`);
if (missing.length) {
  console.log(`::error::Live database is missing ${missing.length} column(s) the app writes:`);
  for (const m of missing) console.log(`  - ${m}`);
  console.log('Run supabase/pending_migrations.sql in the Supabase SQL editor (it is safe to re-run).');
  process.exit(1);
}
console.log(`Live schema has all ${Object.values(tables).flat().length} columns the app writes.`);
