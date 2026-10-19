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
