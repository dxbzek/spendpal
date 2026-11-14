// CI check: does the live database have what the app needs?
//
// Columns: reads the list from src/lib/dbWriteColumns.json and asks PostgREST
// for `select=<columns>&limit=0` on each table with the public (publishable)
// key. No rows come back (RLS, and limit 0), but Postgres still resolves
// every column, so a missing one comes back as error 42703, and a missing
// table as PGRST205.
//
// Tables the app never writes and functions it calls: the list is
// src/lib/dbServerObjects.json. A function is called with the arguments given
// there. The public key has no right to run it, so one that exists answers
// "permission denied" (42501) before any of it runs, and one that is missing
// answers PGRST202. Only functions that refuse a caller who is not signed in
// belong in that list.
//
// Anything missing fails the job with the list. Being unable to reach the
// database is only a warning: that's not schema drift. Policies, grants and
// trigger bodies are not checked: the public key cannot read them.
//
//   node scripts/check-schema.mjs
//   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… node scripts/check-schema.mjs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const written = JSON.parse(read('src/lib/dbWriteColumns.json'));
const server = JSON.parse(read('src/lib/dbServerObjects.json'));
const tables = { ...written, ...server.tables };
// Default to the same project and public key the app ships with.
const client = read('src/integrations/supabase/client.ts');
const fallback = (name) => client.match(new RegExp(`${name}\\s*\\|\\|\\s*'([^']+)'`))?.[1];
const url = process.env.SUPABASE_URL || fallback('VITE_SUPABASE_URL');
const key = process.env.SUPABASE_PUBLISHABLE_KEY || fallback('VITE_SUPABASE_PUBLISHABLE_KEY');

const MISSING_COLUMN = '42703';
// The second code in each pair is what PostgREST passed through before it had its own.
const MISSING_TABLE = ['PGRST205', '42P01'];
const MISSING_FUNCTION = ['PGRST202', '42883'];
const NOT_ALLOWED = '42501';

async function ask(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    // apikey only: a publishable key isn't a JWT, so it can't go in Authorization.
    headers: { apikey: key, ...init.headers },
  });
  if (res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return { status: res.status, code: body.code, message: body.message };
}
const probe = (table, select) => ask(`${table}?select=${encodeURIComponent(select)}&limit=0`);
const call = (fn, args) => ask(`rpc/${fn}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(args),
});
const say = (e) => `${e.status} ${e.code ?? ''} ${e.message ?? ''}`.trim();

// The result is set as process.exitCode and the script ends by itself.
// process.exit() right after a fetch crashes Node on Windows (it closes a
// handle that is already closing), which turned "missing" into a crash code.
const missing = [];
const unknown = [];
let reachable = true;
try {
  for (const [table, cols] of Object.entries(tables)) {
    const err = await probe(table, cols.join(','));
    if (!err) continue;
    if (MISSING_TABLE.includes(err.code)) { missing.push(`table ${table}`); continue; }
    if (err.code !== MISSING_COLUMN) { unknown.push(`${table}: ${say(err)}`); continue; }
    // The error names only the first missing column; check one at a time.
    for (const c of cols) if ((await probe(table, c))?.code === MISSING_COLUMN) missing.push(`${table}.${c}`);
  }
  for (const [fn, args] of Object.entries(server.functions)) {
    const err = await call(fn, args);
    if (err && MISSING_FUNCTION.includes(err.code)) { missing.push(`function ${fn}(${Object.keys(args).join(', ')})`); continue; }
    // It exists. Any answer but "permission denied" means the public key got
    // far enough to run it, so its grants are not what the migration sets.
    if (err?.code !== NOT_ALLOWED) console.log(`::warning::${fn}() should refuse the public key with "permission denied", but answered: ${err ? say(err) : 'success'}`);
  }
} catch (e) {
  reachable = false;
  console.log(`::warning::Schema check skipped, database unreachable: ${e.message}`);
}

for (const u of unknown) console.log(`::warning::Couldn't check ${u}`);
const count = (o) => Object.keys(o).length;
if (!reachable) {
  // Not schema drift: the job stays green.
} else if (missing.length) {
  console.log(`::error::Live database is missing ${missing.length} thing(s) the app needs:`);
  for (const m of missing) console.log(`  - ${m}`);
  console.log('Run supabase/pending_migrations.sql in the Supabase SQL editor (it is safe to re-run).');
  process.exitCode = 1;
} else {
  console.log(`Live schema has all ${Object.values(tables).flat().length} columns of ${count(tables)} tables and ${count(server.functions)} function(s) the app needs.`);
}
