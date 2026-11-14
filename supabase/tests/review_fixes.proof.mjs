// Local proof for supabase/migrations/20261114120000_review_fixes.sql.
//
// Runs every migration in an in-process Postgres (PGlite), with data in the
// old shape already there, then checks what the review-fixes migration does
// to it and what a signed-in user can and cannot do afterwards. It also runs
// the migration a second time, and pending_migrations.sql twice on top, to
// show that re-running changes nothing.
//
// Not part of `npm test`: PGlite is not a dependency of the app. To run it:
//   npm i --no-save @electric-sql/pglite
//   node supabase/tests/review_fixes.proof.mjs
// Nothing here talks to the live database.
import { readdirSync, readFileSync } from 'node:fs';

const { PGlite } = await import(process.env.PGLITE_PATH ?? '@electric-sql/pglite');

const root = new URL('../..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const NEW = '20261114120000_review_fixes.sql';
const migrations = readdirSync(new URL('supabase/migrations', root)).filter(f => f.endsWith('.sql')).sort();

const db = new PGlite();
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
};
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// What Supabase provides before any migration runs, cut down to what the
// migrations touch.
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb DEFAULT '{}');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, UNIQUE (bucket_id, name));
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
    SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
  GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
  GRANT ALL ON storage.objects, storage.buckets TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`);
// PGlite runs in template1, where PUBLIC has no TEMP right; a normal database
// grants it, and convert_currency() needs it.
await db.exec(`GRANT TEMPORARY ON DATABASE template1 TO authenticated`);

const apply = async (label, sql) => {
  try { await db.exec(sql); return true; } catch (e) { check(`${label} applies`, false, e.message); return false; }
};
for (const f of migrations.filter(f => f !== NEW)) {
  if (!(await apply(f, read(`supabase/migrations/${f}`)))) process.exit(1);
}

const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => Object.values((await q(sql, params))[0] ?? {})[0];
// Run one statement the way the API does for a signed-in user (or anon, or the service role).
const as = async (uid, sql, role = 'authenticated') => {
  await db.exec('BEGIN');
  try {
    await db.exec(`SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claim.sub', '${uid ?? ''}', true);`);
    const r = await db.query(sql);
    await db.exec('COMMIT');
    return { ok: true, rows: r.rows, affected: r.affectedRows };
  } catch (e) {
    await db.exec('ROLLBACK');
    return { ok: false, error: e.message };
  }
};
const num = (v) => Number(v);

// ─── Data in the old shape ───────────────────────────────────────────────────
const A = await one(`INSERT INTO auth.users (email) VALUES ('owner@example.com') RETURNING id`);
const B = await one(`INSERT INTO auth.users (email) VALUES ('other@example.com') RETURNING id`);
const acct = async (uid, name, type, balance) =>
  (await as(uid, `INSERT INTO accounts (user_id, name, type, balance) VALUES ('${uid}', '${name}', '${type}', ${balance}) RETURNING id`)).rows[0].id;
const bank = await acct(A, 'Bank', 'debit', 5000);
const card = await acct(A, 'Card', 'credit', 0);
const bankB = await acct(B, 'B bank', 'debit', 100);
const balance = async (id) => num(await one(`SELECT balance FROM accounts WHERE id = $1`, [id]));

const tx = (uid, account, extra = {}) => {
  const row = { user_id: uid, account_id: account, type: 'expense', amount: 10, category: 'Shopping', merchant: 'Shop', ...extra };
  const cols = Object.keys(row);
  const vals = cols.map(c => row[c] === null ? 'NULL' : typeof row[c] === 'string' ? `'${row[c]}'` : row[c]);
  return `INSERT INTO transactions (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING id`;
};
// Two plans on the card (same merchant, different terms), and the first plan's
// merchant and term again on the bank account.
await as(A, tx(A, card, { merchant: 'Tabby', amount: 100, total_installments: 4, current_installment: 1, is_tracking_only: true, date: '2026-09-01' }));
await as(A, tx(A, card, { merchant: 'Tabby', amount: 100, total_installments: 4, current_installment: 2, is_tracking_only: true, date: '2026-10-01' }));
await as(A, tx(A, card, { merchant: 'Tabby', amount: 50, total_installments: 6, current_installment: 1, is_tracking_only: true }));
await as(A, tx(A, bank, { merchant: 'Tabby', amount: 25, total_installments: 4, current_installment: 1 }));
await as(A, tx(A, bank, { merchant: 'Grocer', amount: 75 }));
// Weekly budgets: one next to a monthly budget for the same category and month, one alone.
await as(A, `INSERT INTO budgets (user_id, category, amount, period, month) VALUES
  ('${A}', 'Food', 1000, 'monthly', '2026-11'), ('${A}', 'Food', 100, 'weekly', '2026-11'),
  ('${A}', 'Fun', 200, 'weekly', '2026-11'), ('${A}', 'Rent', 3000, 'monthly', '2026-11')`);
const goal = (await as(A, `INSERT INTO goals (user_id, name, type, target_amount, saved_amount) VALUES ('${A}', 'Trip', 'vacation', 1000, 100) RETURNING id`)).rows[0].id;
await as(A, `INSERT INTO goal_contributions (user_id, goal_id, amount) VALUES ('${A}', '${goal}', 100)`);

console.log('\nBefore the migration (the faults it fixes)');
const before = await balance(bank);
let r = await as(B, tx(B, bank, { amount: 40 }));
check('B can post on A\'s account', r.ok);
eq('and A\'s balance moves', await balance(bank), before - 40);
const strayRow = r.rows[0].id;
r = await as(A, tx(A, card, { merchant: 'New plan', total_installments: 3, current_installment: 0, is_tracking_only: true }));
check('a plan with 0 paid is refused', !r.ok);

// ─── The migration, twice ────────────────────────────────────────────────────
console.log('\nMigration');
const newSql = read(`supabase/migrations/${NEW}`);
check('applies', await apply(NEW, newSql));
const snapshot = async () => JSON.stringify({
  tx: await q(`SELECT id, plan_id, transfer_id, current_installment FROM transactions ORDER BY id`),
  budgets: await q(`SELECT category, month, period, amount FROM budgets ORDER BY category, month, period`),
  accounts: await q(`SELECT id, balance FROM accounts ORDER BY id`),
  policies: await q(`SELECT schemaname, tablename, policyname, cmd, qual, with_check FROM pg_policies ORDER BY 1, 2, 3`),
  checks: await q(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE contype = 'c' ORDER BY 1`),
  bucket: await q(`SELECT * FROM storage.buckets`),
});
const afterFirst = await snapshot();
check('applies a second time', await apply(NEW, newSql));
check('second run changes nothing', (await snapshot()) === afterFirst);

console.log('\nplan_id back-fill');
const plans = await q(`SELECT account_id, merchant, total_installments, count(*)::int AS n, count(DISTINCT plan_id)::int AS ids
  FROM transactions WHERE total_installments IS NOT NULL GROUP BY 1, 2, 3 ORDER BY merchant, total_installments, n`);
eq('one id per account + merchant + term', plans.map(p => [p.n, p.ids]), [[1, 1], [2, 1], [1, 1]]);
eq('three plans in all', num(await one(`SELECT count(DISTINCT plan_id) FROM transactions`)), 3);
eq('rows that are not a plan get none', num(await one(`SELECT count(*) FROM transactions WHERE total_installments IS NULL AND plan_id IS NOT NULL`)), 0);
eq('balances did not move', [await balance(bank), await balance(card)], [before - 40, 0]);
// A row added later without a plan_id (an old copy of the app, or a script).
await as(A, tx(A, card, { merchant: 'Tabby', amount: 100, total_installments: 4, current_installment: 3, is_tracking_only: true }));
await apply(NEW, newSql);
eq('a later row joins its plan on the next run', await q(`SELECT count(*)::int AS n, count(DISTINCT plan_id)::int AS ids FROM transactions
  WHERE account_id = $1 AND merchant = 'Tabby' AND total_installments = 4`, [card]), [{ n: 3, ids: 1 }]);

console.log('\nAccount ownership');
let bal = await balance(bank);
r = await as(B, tx(B, bank, { amount: 50 }));
check('B cannot post on A\'s account', !r.ok, 'insert was accepted');
r = await as(B, tx(B, bankB, { type: 'income', amount: 5 }));
check('B can post on B\'s own account', r.ok, r.error);
r = await as(B, `UPDATE transactions SET account_id = '${bank}' WHERE id = '${r.rows[0].id}'`);
check('B cannot move a row to A\'s account', !r.ok, 'update was accepted');
eq('A\'s balance did not move', await balance(bank), bal);
// The service role skips row level security, so only the trigger guard is left.
r = await as(null, tx(B, bank, { amount: 60 }), 'service_role');
eq('a row for B on A\'s account moves nothing, even past the policies', await balance(bank), bal);
await db.query(`DELETE FROM transactions WHERE id = $1`, [r.rows[0].id]);
eq('and neither does deleting it', await balance(bank), bal);
r = await as(B, `DELETE FROM transactions WHERE id = '${strayRow}'`);
eq('deleting B\'s old row on A\'s account moves nothing', await balance(bank), bal);
r = await as(A, tx(A, bank, { amount: 10 }));
eq('A\'s own expense still moves A\'s balance', await balance(bank), bal - 10);
r = await as(A, tx(A, bank, { amount: 999, is_pending: true }));
eq('a pending row still moves nothing', await balance(bank), bal - 10);
r = await as(A, `UPDATE transactions SET is_pending = false, amount = 20 WHERE id = '${r.rows[0].id}'`);
eq('and counts once it settles', await balance(bank), bal - 30);
await as(A, tx(A, card, { amount: 70 }));
eq('a card charge still raises what is owed', await balance(card), 70);

console.log('\nInstalments');
r = await as(A, tx(A, card, { merchant: 'New plan', total_installments: 3, current_installment: 0, is_tracking_only: true }));
check('0 paid is accepted', r.ok, r.error);
check('-1 paid is refused', !(await as(A, tx(A, card, { merchant: 'X', total_installments: 3, current_installment: -1 }))).ok);
check('4 of 3 paid is refused', !(await as(A, tx(A, card, { merchant: 'X', total_installments: 3, current_installment: 4 }))).ok);

console.log('\nWeekly budgets');
eq('converted and merged', (await q(`SELECT category, period, amount FROM budgets WHERE user_id = $1 ORDER BY category`, [A]))
  .map(b => [b.category, b.period, num(b.amount)]),
  // Food: 1000 + 100 * 52 / 12 = 1433.33. Fun: 200 * 52 / 12 = 866.67.
  [['Food', 'monthly', 1433.33], ['Fun', 'monthly', 866.67], ['Rent', 'monthly', 3000]]);

console.log('\nCurrency conversion and goal contributions');
r = await as(A, `SELECT convert_currency('AED', 'USD', 0.5)`);
check('convert_currency runs (it also writes profiles.currency)', r.ok, r.error);
eq('contributions are converted too', num(await one(`SELECT amount FROM goal_contributions WHERE goal_id = $1`, [goal])), 50);
eq('profile currency changed', await one(`SELECT currency FROM profiles WHERE user_id = $1`, [A]), 'USD');
check('B cannot change A\'s contribution', (await as(B, `UPDATE goal_contributions SET amount = 1`)).affected === 0);

console.log('\nProfile');
r = await as(A, `UPDATE profiles SET phone_verified_at = now() WHERE user_id = '${A}'`);
check('a user cannot set phone_verified_at', !r.ok, 'update was accepted');
r = await as(A, `UPDATE profiles SET display_name = 'Z', avatar_url = 'u', notify_email = true, notify_sms = true, phone_number = '+971500000000' WHERE user_id = '${A}'`);
check('the columns the app writes still save', r.ok && r.affected === 1, r.error);
await as(null, `UPDATE profiles SET phone_verified_at = now() WHERE user_id = '${A}'`, 'service_role');
check('the service role can set the flag', (await one(`SELECT phone_verified_at FROM profiles WHERE user_id = $1`, [A])) != null);
await as(A, `UPDATE profiles SET notify_email = false WHERE user_id = '${A}'`);
check('an unrelated save keeps the flag', (await one(`SELECT phone_verified_at FROM profiles WHERE user_id = $1`, [A])) != null);
await as(A, `UPDATE profiles SET phone_number = '+971500000001' WHERE user_id = '${A}'`);
check('a new number clears the flag', (await one(`SELECT phone_verified_at FROM profiles WHERE user_id = $1`, [A])) == null);
await as(null, `UPDATE profiles SET phone_number = '+971500000002', phone_verified_at = now() WHERE user_id = '${A}'`, 'service_role');
check('number and flag set together keep the flag', (await one(`SELECT phone_verified_at FROM profiles WHERE user_id = $1`, [A])) != null);

console.log('\nAvatar bucket');
eq('2 MB limit', num(await one(`SELECT file_size_limit FROM storage.buckets WHERE id = 'avatars'`)), 2097152);
check('images only', (await one(`SELECT allowed_mime_types FROM storage.buckets WHERE id = 'avatars'`)).every(t => t.startsWith('image/')));
const upsert = (uid, path) => `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('avatars', '${path}', '${uid}')
  ON CONFLICT (name, bucket_id) DO UPDATE SET metadata = '{}'::jsonb, owner = EXCLUDED.owner RETURNING id`;
r = await as(A, upsert(A, `${A}/avatar.png`));
check('upsert of a new avatar works', r.ok, r.error);
r = await as(A, upsert(A, `${A}/avatar.png`));
check('upsert over the old avatar works', r.ok, r.error);
check('upsert into another user\'s folder is refused', !(await as(B, upsert(B, `${A}/avatar.jpg`))).ok);
eq('B sees none of A\'s files', (await as(B, `SELECT * FROM storage.objects`)).rows.length, 0);
eq('B deletes none of A\'s files', (await as(B, `DELETE FROM storage.objects`)).affected, 0);
eq('A can delete the old file', (await as(A, `DELETE FROM storage.objects WHERE name = '${A}/avatar.png'`)).affected, 1);

console.log('\nuser_settings');
const saveSettings = (uid, owner, data) => `INSERT INTO user_settings (user_id, data) VALUES ('${owner}', '${JSON.stringify(data)}')
  ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data`;
check('a user can save settings', (await as(A, saveSettings(A, A, { payday: 25 }))).ok);
const stamp = await one(`SELECT updated_at FROM user_settings WHERE user_id = $1`, [A]);
await new Promise(res => setTimeout(res, 5));
check('and save them again', (await as(A, saveSettings(A, A, { payday: 28 }))).ok);
eq('the second save replaced the first', await one(`SELECT data FROM user_settings WHERE user_id = $1`, [A]), { payday: 28 });
check('updated_at moved', new Date(await one(`SELECT updated_at FROM user_settings WHERE user_id = $1`, [A])) > new Date(stamp));
check('B cannot write A\'s row', !(await as(B, saveSettings(B, A, { payday: 1 }))).ok);
eq('B cannot read A\'s row', (await as(B, `SELECT * FROM user_settings`)).rows.length, 0);
eq('anon reads nothing', (await as(null, `SELECT * FROM user_settings`, 'anon')).rows.length, 0);
eq('A can delete their row', (await as(A, `DELETE FROM user_settings`)).affected, 1);

console.log('\nai_usage');
check('the service role counts a call', (await as(null, `INSERT INTO ai_usage (user_id, day, calls) VALUES ('${A}', CURRENT_DATE, 1), ('${B}', CURRENT_DATE, 7)
  ON CONFLICT (user_id, day) DO UPDATE SET calls = ai_usage.calls + 1`, 'service_role')).ok);
eq('a user reads only their own count', (await as(A, `SELECT calls FROM ai_usage`)).rows, [{ calls: 1 }]);
check('a user cannot add a row', !(await as(A, `INSERT INTO ai_usage (user_id, day, calls) VALUES ('${A}', CURRENT_DATE - 1, 0)`)).ok);
check('a user cannot reset their count', !(await as(A, `UPDATE ai_usage SET calls = 0`)).ok);
check('a user cannot delete their count', !(await as(A, `DELETE FROM ai_usage`)).ok);
eq('anon reads nothing', (await as(null, `SELECT * FROM ai_usage`, 'anon')).rows.length, 0);

// ─── restore_backup ──────────────────────────────────────────────────────────
console.log('\nrestore_backup');
const uuid = async () => one(`SELECT gen_random_uuid()`);
const [a1, a2, g1, planId, transferId] = [await uuid(), await uuid(), await uuid(), await uuid(), await uuid()];
// Rows as src/lib/backup.ts prepareRestore() builds them: only the columns the
// app writes, new ids on accounts and goals, user_id on every row, account
// balance 0 with the real balance in `balances`.
const payload = {
  accounts: [
    // user_id is another user's on purpose: the function must ignore it.
    { user_id: B, name: 'Wallet', type: 'cash', balance: 0, currency: 'AED', icon: 'W', id: a1 },
    { user_id: A, name: 'Visa', type: 'credit', balance: 0, credit_limit: 10000, due_date: 5, statement_due_on: '2026-12-05', exclude_from_spendable: true, id: a2 },
  ],
  balances: [{ id: a1, balance: 123.45 }, { id: a2, balance: 2500 }],
  transactions: [
    { user_id: A, account_id: a1, type: 'expense', amount: 30, currency: 'AED', category: 'Food', category_icon: 'F', merchant: 'Cafe', date: '2026-11-01', note: null, is_recurring: false },
    { user_id: A, account_id: a1, type: 'expense', amount: 0, category: 'Food', merchant: 'Free sample', date: '2026-11-02' },
    { user_id: A, account_id: a2, type: 'expense', amount: 200, category: 'Shopping', merchant: 'Tabby', date: '2026-11-03', total_installments: 4, current_installment: 0, is_tracking_only: true, remaining_principal: 800, plan_id: planId },
    { user_id: A, account_id: a1, type: 'expense', amount: 500, category: 'Transfer', merchant: 'Transfer', date: '2026-11-04', is_internal: true, transfer_id: transferId },
    { user_id: A, account_id: a2, type: 'income', amount: 500, category: 'Transfer', merchant: 'Transfer', date: '2026-11-04', is_internal: true, transfer_id: transferId },
  ],
  budgets: [
    { user_id: A, category: 'Food', category_icon: 'F', amount: 1000, period: 'monthly', month: '2026-11', is_fixed: false },
    { user_id: A, category: 'Food', amount: 120, period: 'weekly', month: '2026-11' },
    { user_id: A, category: 'Fun', amount: 60, period: 'weekly', month: '2026-11' },
  ],
  goals: [{ user_id: A, name: 'Holiday', icon: 'G', type: 'savings', target_amount: 5000, saved_amount: 1200, deadline: '2027-06-30', status: 'active', id: g1 }],
  goal_contributions: [{ goal_id: g1, user_id: A, amount: 1200, note: 'Deposit', created_at: '2026-06-01T10:00:00+00:00' }],
};
const restore = (uid, p, role) => as(uid, `SELECT restore_backup('${JSON.stringify(p).replace(/'/g, "''")}'::jsonb) AS result`, role);
const owned = async (uid) => JSON.stringify({
  accounts: await q(`SELECT name, type, balance FROM accounts WHERE user_id = $1 ORDER BY created_at`, [uid]),
  tx: await q(`SELECT merchant, amount FROM transactions WHERE user_id = $1 ORDER BY merchant, amount`, [uid]),
  budgets: await q(`SELECT category, amount FROM budgets WHERE user_id = $1 ORDER BY category`, [uid]),
  goals: await q(`SELECT name FROM goals WHERE user_id = $1`, [uid]),
  contributions: await q(`SELECT amount FROM goal_contributions WHERE user_id = $1`, [uid]),
});
const beforeA = await owned(A), beforeB = await owned(B);

check('anon may not call it', !(await restore(null, payload, 'anon')).ok);
r = await restore(A, { accounts: 'nope', transactions: [] });
check('a payload of the wrong shape is refused', !r.ok && /invalid backup/.test(r.error), r.error);
eq('and nothing was deleted', await owned(A), beforeA);
// The last list to be written holds a row the database refuses.
r = await restore(A, { ...payload, goal_contributions: [{ goal_id: g1, user_id: A, amount: -5 }] });
check('a restore with one bad row fails', !r.ok);
eq('and the old data is all still there', await owned(A), beforeA);
r = await restore(A, { ...payload, transactions: [...payload.transactions, { user_id: A, account_id: bankB, type: 'expense', amount: 1, category: 'x', merchant: 'x', date: '2026-11-05' }] });
check('a row on another user\'s account fails the restore', !r.ok);
eq('and the old data is all still there', await owned(A), beforeA);

r = await restore(A, payload);
check('a good restore runs', r.ok, r.error);
eq('it returns the counts', r.rows?.[0]?.result, { accounts: 2, transactions: 5 });
eq('accounts are the backup\'s, in file order, with the backed-up balances',
  (await q(`SELECT id, name, balance, icon, currency, exclude_from_spendable FROM accounts WHERE user_id = $1 ORDER BY created_at`, [A]))
    .map(a => [a.id, a.name, num(a.balance), a.icon, a.currency, a.exclude_from_spendable]),
  [[a1, 'Wallet', 123.45, 'W', 'AED', false], [a2, 'Visa', 2500, '\u{1F4B3}', 'AED', true]]);
eq('no row went to the user named in the payload', await owned(B), beforeB);
eq('all five transactions are there, zero amount included', num(await one(`SELECT count(*) FROM transactions WHERE user_id = $1`, [A])), 5);
eq('plan_id, 0 paid and remaining principal are kept', (await q(`SELECT plan_id, current_installment, remaining_principal FROM transactions WHERE merchant = 'Tabby' AND user_id = $1`, [A]))
  .map(t => [t.plan_id, t.current_installment, num(t.remaining_principal)]), [[planId, 0, 800]]);
eq('both transfer halves keep their transfer_id', num(await one(`SELECT count(*) FROM transactions WHERE transfer_id = $1`, [transferId])), 2);
eq('missing values take the column defaults', (await q(`SELECT currency, category_icon, is_recurring, is_pending, dupe_dismissed FROM transactions WHERE merchant = 'Free sample'`))
  .map(t => [t.currency, t.category_icon, t.is_recurring, t.is_pending, t.dupe_dismissed]), [['AED', '\u{1F4CC}', false, false, false]]);
eq('weekly budgets come back monthly', (await q(`SELECT category, period, amount FROM budgets WHERE user_id = $1 ORDER BY category`, [A]))
  .map(b => [b.category, b.period, num(b.amount)]),
  // Food: 1000 + 120 * 52 / 12 = 1520. Fun: 60 * 52 / 12 = 260.
  [['Food', 'monthly', 1520], ['Fun', 'monthly', 260]]);
eq('goal and contribution, with its date', (await q(`SELECT g.id, c.amount, c.note, c.created_at FROM goal_contributions c JOIN goals g ON g.id = c.goal_id WHERE c.user_id = $1`, [A]))
  .map(c => [c.id, num(c.amount), c.note, new Date(c.created_at).toISOString()]), [[g1, 1200, 'Deposit', '2026-06-01T10:00:00.000Z']]);
eq('B\'s account was not touched', await balance(bankB), num(JSON.parse(beforeB).accounts[0].balance));
r = await restore(A, { accounts: [], transactions: [] });
eq('the short lists are optional', r.rows?.[0]?.result, { accounts: 0, transactions: 0 });

// ─── pending_migrations.sql on top, twice ────────────────────────────────────
console.log('\npending_migrations.sql');
await restore(A, payload);
const pending = read('supabase/pending_migrations.sql');
check('runs on top of the migrations', await apply('pending_migrations.sql', pending));
const afterPending = await snapshot();
check('runs a second time', await apply('pending_migrations.sql', pending));
check('second run changes nothing', (await snapshot()) === afterPending);
eq('a plan with 0 paid stays at 0', num(await one(`SELECT current_installment FROM transactions WHERE plan_id = $1`, [planId])), 0);
check('B still cannot post on A\'s account', !(await as(B, tx(B, a1, { amount: 50 }))).ok);
check('a user still cannot set phone_verified_at', !(await as(A, `UPDATE profiles SET phone_verified_at = now() WHERE user_id = '${A}'`)).ok);
eq('balances are as restored', [await balance(a1), await balance(a2)], [123.45, 2500]);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
