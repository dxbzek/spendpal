// The app's column list vs. the code that writes and the SQL that creates.
// A column the code writes that isn't listed, or a migration that isn't in
// pending_migrations.sql, fails here before it can break a save in production.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { APP_WRITE_COLUMNS, findMissingColumns } from '@/lib/dbSchema';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrationFiles = readdirSync(join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
const pending = read('supabase/pending_migrations.sql');

const stripSqlComments = (sql: string) => sql.replace(/--.*$/gm, '');

/** table → columns added by `ALTER TABLE … ADD COLUMN` statements. */
function addedColumns(sql: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [, table, body] of stripSqlComments(sql).matchAll(/ALTER TABLE\s+(?:public\.)?(\w+)([\s\S]*?);/gi)) {
    for (const [, col] of body.matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)/gi)) {
      if (!out.has(table)) out.set(table, new Set());
      out.get(table)!.add(col);
    }
  }
  return out;
}

/** table → columns declared in `CREATE TABLE`. */
function createdColumns(sql: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [, table, body] of stripSqlComments(sql).matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    const cols = new Set<string>();
    for (const line of body.split('\n')) {
      const m = line.trim().match(/^(\w+)\s+[A-Za-z]/);
      if (m && !/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)$/i.test(m[1])) cols.add(m[1]);
    }
    out.set(table, cols);
  }
  return out;
}

const has = (m: Map<string, Set<string>>, t: string, c: string) => m.get(t)?.has(c) ?? false;

/** Extract the object literal passed to `.from('t')….insert/update/upsert(` and return its keys. */
function writtenKeys(src: string): Array<{ table: string; key: string }> {
  const out: Array<{ table: string; key: string }> = [];
  const re = /\.from\('(\w+)'\)\s*\.(?:insert|update|upsert)\(/g;
  for (const m of src.matchAll(re)) {
    const table = m[1];
    // The argument, up to its closing paren.
    let i = m.index! + m[0].length, depth = 1;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if ('([{'.includes(src[i])) depth++;
      else if (')]}'.includes(src[i])) depth--;
    }
    const arg = src.slice(start, i - 1);
    // The object literal: the argument itself, or the row a .map(() => ({…})) builds.
    const at = arg.trimStart().startsWith('{') ? arg.indexOf('{') : arg.indexOf('({') + 1;
    if (at <= 0 && !arg.trimStart().startsWith('{')) continue; // a variable; its keys are checked where it's built
    // Split the literal's top level into entries.
    let d = 0, entry = '';
    const entries: string[] = [];
    for (const ch of arg.slice(at + 1)) {
      if ('([{'.includes(ch)) d++;
      if (')]}'.includes(ch)) { if (d === 0) break; d--; }
      if (ch === ',' && d === 0) { entries.push(entry); entry = ''; } else entry += ch;
    }
    entries.push(entry);
    for (const raw of entries) {
      const e = raw.replace(/\/\/.*$/gm, '').trim();
      if (!e) continue;
      if (e.startsWith('...')) {
        // Conditional spreads, `...(cond && { col: v })`, or a helper defined
        // in the same file, `...statementColumns(a)` → `const statementColumns = (…) => ({…})`.
        const helper = e.match(/^\.\.\.(\w+)\(/)?.[1];
        const body = helper ? src.match(new RegExp(`const ${helper} = [^\\n]*=> \\(\\{([\\s\\S]*?)\\n\\}\\);`))?.[1] ?? '' : e;
        for (const [, k] of body.matchAll(/([a-z_][a-z0-9_]*): /g)) out.push({ table, key: k });
        continue;
      }
      const k = e.match(/^([a-z_][a-z0-9_]*)\s*(?::|$)/)?.[1];
      if (k) out.push({ table, key: k });
    }
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? (d.name === 'test' ? [] : sourceFiles(join(dir, d.name)))
      : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);
}

describe('columns the app writes', () => {
  const writes = sourceFiles('src').flatMap(f => writtenKeys(read(f)).map(w => ({ ...w, file: f })));

  it('finds the write sites (sanity check on the parser)', () => {
    const tx = writes.filter(w => w.table === 'transactions').map(w => w.key);
    expect(tx).toContain('is_pending');
    expect(tx).toContain('remaining_principal');
    expect(writes.filter(w => w.table === 'accounts').map(w => w.key)).toContain('exclude_from_spendable');
  });

  it('are all listed in dbWriteColumns.json, so the schema check covers them', () => {
    const unlisted = writes
      .filter(w => !(APP_WRITE_COLUMNS[w.table] ?? []).includes(w.key))
      .map(w => `${w.table}.${w.key} (${w.file})`);
    expect(unlisted).toEqual([]);
  });

  it('are all created by a migration', () => {
    const created = createdColumns(migrationFiles.map(f => read(`supabase/migrations/${f}`)).join('\n'));
    const added = addedColumns(migrationFiles.map(f => read(`supabase/migrations/${f}`)).join('\n'));
    const missing = Object.entries(APP_WRITE_COLUMNS).flatMap(([t, cols]) =>
      cols.filter(c => !has(created, t, c) && !has(added, t, c)).map(c => `${t}.${c}`));
    expect(missing).toEqual([]);
  });
});

describe('pending_migrations.sql', () => {
  // Everything before it existed was applied through the Supabase CLI.
  const tracked = migrationFiles.filter(f => f >= '20260329');

  it('adds every column a migration adds', () => {
    const inPending = addedColumns(pending);
    const missing = tracked.flatMap(f => [...addedColumns(read(`supabase/migrations/${f}`))]
      .flatMap(([t, cols]) => [...cols].filter(c => !has(inPending, t, c)).map(c => `${t}.${c} (${f})`)));
    expect(missing).toEqual([]);
  });

  it('creates every table a migration creates', () => {
    const inPending = createdColumns(pending);
    const missing = tracked.flatMap(f => [...createdColumns(read(`supabase/migrations/${f}`)).keys()]
      .filter(t => !inPending.has(t)).map(t => `${t} (${f})`));
    expect(missing).toEqual([]);
  });

  it('names every migration file it covers', () => {
    // Section headers cite the migration date, e.g. "(20261019000000)".
    const unnamed = tracked
      .map(f => f.slice(0, 14))
      .filter(stamp => !pending.includes(stamp) && !pending.includes(stamp.slice(0, 8)));
    expect(unnamed).toEqual([]);
  });
});

// The file is run top to bottom, so the last definition of a thing is the one
// the database ends up with. These read that last definition.
describe('what pending_migrations.sql leaves in place', () => {
  const sql = stripSqlComments(pending).replace(/\r\n/g, '\n');
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
  /** The last statement that starts with `head`, up to `end`. */
  const last = (head: string, end = ';') => {
    const at = sql.lastIndexOf(head);
    expect(at, `no "${head}" in pending_migrations.sql`).toBeGreaterThanOrEqual(0);
    return squash(sql.slice(at, sql.indexOf(end, at) + end.length));
  };
  const ownsAccount = 'EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = transactions.account_id AND a.user_id = (select auth.uid()))';

  it('holds every statement of the review-fixes migration', () => {
    const migration = stripSqlComments(read('supabase/migrations/20261114120000_review_fixes.sql'));
    expect(squash(sql)).toContain(squash(migration));
  });

  it('back-fills plan_id on the same key the app uses for rows without one', () => {
    // planKey() in src/lib/finance/installments.ts: account + merchant + term
    // + instalment amount. A back-fill without the amount gives two plans at
    // one merchant with the same term one id, and the app then merges them.
    const fill = last('WITH plan_groups AS MATERIALIZED');
    expect(fill).toContain('GROUP BY user_id, account_id, merchant, total_installments, round(amount, 2)');
    expect(fill).toContain('AND round(t.amount, 2) = g.instalment');
    expect(fill).toContain('WHERE t.plan_id IS NULL');
  });

  it('lets a transaction be inserted or updated only on the user\'s own account', () => {
    // user_id alone let a signed-in user post a row on another user's account,
    // and the balance trigger then moved that account's balance.
    for (const policy of ['Users can insert own transactions', 'Users can update own transactions']) {
      const def = last(`CREATE POLICY "${policy}"`);
      expect(def).toMatch(/WITH CHECK \( \(select auth\.uid\(\)\) = user_id AND EXISTS/);
      expect(def).toContain(ownsAccount);
    }
  });

  it('has a balance trigger that only moves an account of the row\'s user, and still skips pending rows', () => {
    const body = last('CREATE OR REPLACE FUNCTION public.sync_account_balance()', '$$;');
    const updates = body.match(/UPDATE accounts SET balance = balance \+ delta WHERE [^;]+;/g) ?? [];
    expect(updates).toHaveLength(4);
    for (const u of updates) expect(u).toMatch(/WHERE id = (NEW|OLD)\.account_id AND user_id = \1\.user_id;/);
    // One guard for each of: insert, delete, the old half and the new half of an update.
    expect(body.match(/is_tracking_only OR (NEW|OLD)\.is_pending/g)).toHaveLength(4);
  });

  it('allows a plan with 0 instalments paid, and never rewrites 0 to 1', () => {
    const checks = [...sql.matchAll(/ADD CONSTRAINT transactions_installments_valid\s+CHECK[\s\S]*?;/g)].map(m => squash(m[0]));
    expect(checks.length).toBeGreaterThan(0);
    // Every copy, not just the last: an earlier, stricter one would fail on
    // a 0-paid row before the last one is reached.
    for (const c of checks) expect(c).toContain('current_installment >= 0 AND current_installment <= total_installments');
    expect(sql).not.toMatch(/SET current_installment = [1-9]/);
  });

  it('grants profile updates for exactly the columns the app writes, so phone_verified_at stays closed', () => {
    expect(squash(sql)).toContain('REVOKE INSERT, UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;');
    const granted = last('GRANT UPDATE (').match(/^GRANT UPDATE \(([^)]*)\) ON public\.profiles TO authenticated;$/)?.[1].split(',').map(c => c.trim());
    expect(granted?.sort()).toEqual([...APP_WRITE_COLUMNS.profiles].sort());
  });

  it('has an UPDATE policy on goal_contributions, which convert_currency() needs', () => {
    expect(last('CREATE POLICY "Users can update own goal contributions"')).toContain('FOR UPDATE USING ((select auth.uid()) = user_id)');
  });

  it('limits the avatar bucket and lets a user read and delete only their own folder', () => {
    expect(last('UPDATE storage.buckets')).toMatch(/file_size_limit = 2097152, allowed_mime_types = ARRAY\[('image\/[a-z]+',? ?)+\] WHERE id = 'avatars';/);
    const ownFolder = "USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text)";
    expect(last('CREATE POLICY "Users can view own avatar"')).toContain(`FOR SELECT TO authenticated ${ownFolder}`);
    expect(last('CREATE POLICY "Users can delete own avatar"')).toContain(`FOR DELETE TO authenticated ${ownFolder}`);
  });

  it('turns weekly budgets into monthly ones at amount * 52 / 12', () => {
    // From the first statement of the one-time conversion to the end of its block.
    const block = last('UPDATE public.budgets m', 'END $$;');
    expect(block).toContain("SET amount = round(amount * 52 / 12, 2), period = 'monthly' WHERE period = 'weekly';");
    // A weekly row next to a monthly row for the same category and month is added in, then deleted.
    expect(block).toContain('SET amount = m.amount + w.converted');
    expect(block).toContain("DELETE FROM public.budgets w WHERE w.period = 'weekly' AND EXISTS");
  });

  it('keeps ai_usage read-only for users and user_settings private to its owner', () => {
    const s = squash(sql);
    expect(s).toContain('ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;');
    expect(s).toContain('REVOKE ALL ON public.ai_usage FROM PUBLIC, anon, authenticated; GRANT SELECT ON public.ai_usage TO anon, authenticated;');
    expect([...s.matchAll(/CREATE POLICY "[^"]+" ON public\.ai_usage FOR (\w+)/g)].map(m => m[1])).toEqual(['SELECT']);
    expect(s).toContain('ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;');
    const settings = [...s.matchAll(/CREATE POLICY "[^"]+" ON public\.user_settings FOR (\w+) TO authenticated ([^;]+);/g)];
    expect(settings.map(m => m[1]).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    for (const [, , rule] of settings) expect(rule).toContain('(select auth.uid()) = user_id');
  });

  describe('restore_backup()', () => {
    const body = () => last('CREATE OR REPLACE FUNCTION public.restore_backup(payload JSONB)', '$$;');

    it('runs as the caller, for signed-in users only', () => {
      expect(body()).toContain('SECURITY INVOKER');
      expect(body()).toContain("IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;");
      const s = squash(sql);
      expect(s).toContain('REVOKE ALL ON FUNCTION public.restore_backup(JSONB) FROM PUBLIC, anon, service_role;');
      expect(s).toContain('GRANT EXECUTE ON FUNCTION public.restore_backup(JSONB) TO authenticated;');
    });

    it('writes every column the app writes, so a restore drops nothing', () => {
      // A column added to dbWriteColumns.json later must be added to the
      // function too, or a restore would silently lose it.
      const inserts = new Map([...body().matchAll(/INSERT INTO (\w+) \(([^)]*)\)/g)].map(m => [m[1], m[2].split(',').map(c => c.trim())]));
      for (const table of ['accounts', 'transactions', 'budgets', 'goals', 'goal_contributions']) {
        expect(inserts.get(table), `no INSERT INTO ${table}`).toBeDefined();
        expect(APP_WRITE_COLUMNS[table].filter(c => !inserts.get(table)!.includes(c)), table).toEqual([]);
      }
    });

    it('has its own 60 s limit, above the 8 s a signed-in request gets', () => {
      // src/lib/backup.ts sends the whole backup in one call and reports
      // error 57014 as "took too long". Without this a few thousand rows
      // could not be restored.
      expect(body()).toContain("SET statement_timeout TO '60s' AS $$");
    });

    it('never takes user_id from the file', () => {
      // No column list read from the payload names user_id: every insert uses the caller's id.
      const read = [...body().matchAll(/AS [rb]\(([^)]*)\)/g)].map(m => m[1]);
      expect(read.length).toBeGreaterThanOrEqual(6);
      for (const cols of read) expect(cols).not.toMatch(/\buser_id\b/);
      expect(body().match(/SELECT (r\.id, )?uid,/g)).toHaveLength(5);
    });

    it('checks the payload before it deletes anything', () => {
      const b = body();
      expect(b.indexOf("RAISE EXCEPTION 'invalid backup")).toBeGreaterThan(0);
      expect(b.lastIndexOf("RAISE EXCEPTION 'invalid backup")).toBeLessThan(b.indexOf('DELETE FROM'));
    });
  });
});

describe('tables and functions the app needs but does not write (dbServerObjects.json)', () => {
  const objects: { tables: Record<string, string[]>; functions: Record<string, Record<string, unknown>> } =
    JSON.parse(read('src/lib/dbServerObjects.json'));
  const migrations = migrationFiles.map(f => read(`supabase/migrations/${f}`)).join('\n');

  it('are created by a migration and by pending_migrations.sql, with the listed columns', () => {
    for (const source of [migrations, pending]) {
      const created = createdColumns(source);
      const missing = Object.entries(objects.tables).flatMap(([t, cols]) => cols.filter(c => !has(created, t, c)).map(c => `${t}.${c}`));
      expect(missing).toEqual([]);
    }
  });

  it('have their functions defined with the listed arguments', () => {
    for (const source of [migrations, pending]) {
      for (const [fn, args] of Object.entries(objects.functions)) {
        const signature = stripSqlComments(source).match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(([^)]*)\\)`))?.[1];
        expect(signature, `${fn} is not defined`).toBeDefined();
        expect(signature!.split(',').map(a => a.trim().split(/\s+/)[0])).toEqual(Object.keys(args));
      }
    }
  });

  it('do not repeat a table the app writes', () => {
    expect(Object.keys(objects.tables).filter(t => t in APP_WRITE_COLUMNS)).toEqual([]);
  });
});

describe('startup schema check', () => {
  const tables = { accounts: ['name', 'apr', 'exclude_from_spendable'], budgets: ['amount'] };
  const undefinedColumn = { code: '42703' };

  it('lists every missing column, not just the first', async () => {
    const live: Record<string, string[]> = { accounts: ['name'], budgets: ['amount'] };
    const probe = async (table: string, select: string) => ({
      error: select.split(',').every(c => live[table].includes(c)) ? null : undefinedColumn,
    });
    expect((await findMissingColumns(probe, tables)).missing).toEqual(['accounts.apr', 'accounts.exclude_from_spendable']);
  });

  it('is quiet when everything is there', async () => {
    expect((await findMissingColumns(async () => ({ error: null }), tables)).missing).toEqual([]);
  });

  it("doesn't call a network or auth failure a missing column", async () => {
    const probe = async () => ({ error: { code: 'PGRST301' } });
    expect((await findMissingColumns(probe, tables)).missing).toEqual([]);
  });
});
