// scripts/check-schema.mjs, run for real against a stand-in for the API.
// The stand-in answers the way PostgREST does for the public key: an empty
// list for a table that has the columns, 42703 for a missing column, PGRST205
// for a missing table, PGRST202 for a missing function and "permission denied"
// for a function that exists. Nothing here reaches the live database:
// SUPABASE_URL always points at the stand-in.
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';

const root = resolve(__dirname, '../..');
const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const written: Record<string, string[]> = json('src/lib/dbWriteColumns.json');
const server: { tables: Record<string, string[]>; functions: Record<string, Record<string, unknown>> } = json('src/lib/dbServerObjects.json');

interface Live {
  tables: Record<string, string[]>;
  functions: string[];
}
/** A database that has everything the app needs. */
const complete = (): Live => ({
  tables: structuredClone({ ...written, ...server.tables }),
  functions: Object.keys(server.functions),
});

interface Seen { method: string; path: string; body: string; authorization: string | undefined }

let api: Server | undefined;
afterEach(() => new Promise<void>(done => { if (api) api.close(() => done()); else done(); api = undefined; }));

function standIn(live: Live, seen: Seen[]): Promise<string> {
  api = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x');
      seen.push({ method: req.method ?? '', path: url.pathname, body, authorization: req.headers.authorization });
      const answer = (status: number, payload: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      const name = url.pathname.replace('/rest/v1/', '');
      if (name.startsWith('rpc/')) {
        const fn = name.slice(4);
        if (!live.functions.includes(fn)) return answer(404, { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` });
        return answer(401, { code: '42501', message: `permission denied for function ${fn}` });
      }
      const cols = live.tables[name];
      if (!cols) return answer(404, { code: 'PGRST205', message: `Could not find the table 'public.${name}' in the schema cache` });
      const gone = (url.searchParams.get('select') ?? '').split(',').find(c => !cols.includes(c));
      if (gone) return answer(400, { code: '42703', message: `column ${name}.${gone} does not exist` });
      answer(200, []);
    });
  });
  return new Promise(done => api!.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(api!.address() as AddressInfo).port}`)));
}

// Not execFileSync: the stand-in runs in this process and must keep answering.
function runScript(url: string): Promise<{ code: number | null; out: string }> {
  return new Promise(done => {
    const child = spawn(process.execPath, ['scripts/check-schema.mjs'], {
      cwd: root,
      env: { ...process.env, SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: 'public-key-for-tests' },
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => done({ code, out }));
  });
}

async function check(live: Live) {
  const seen: Seen[] = [];
  const result = await runScript(await standIn(live, seen));
  return { ...result, seen };
}

describe('scripts/check-schema.mjs', () => {
  it('passes when every table, column and function is there', async () => {
    const { code, out } = await check(complete());
    expect(out).toContain('Live schema has all');
    expect(code).toBe(0);
  });

  it('fails when a table an edge function writes is missing', async () => {
    const live = complete();
    delete live.tables.ai_usage;
    const { code, out } = await check(live);
    expect(out).toContain('- table ai_usage');
    expect(code).toBe(1);
  });

  it('fails when a table the app writes is missing', async () => {
    const live = complete();
    delete live.tables.user_settings;
    const { code, out } = await check(live);
    expect(out).toContain('- table user_settings');
    expect(code).toBe(1);
  });

  it('fails when a function the app calls is missing', async () => {
    const { code, out } = await check({ ...complete(), functions: [] });
    expect(out).toContain('- function restore_backup(payload)');
    expect(code).toBe(1);
  });

  it('still lists every missing column', async () => {
    const live = complete();
    live.tables.transactions = live.tables.transactions.filter(c => c !== 'plan_id' && c !== 'transfer_id');
    const { code, out } = await check(live);
    expect(out).toContain('- transactions.plan_id');
    expect(out).toContain('- transactions.transfer_id');
    expect(code).toBe(1);
  });

  it('lists everything that is missing in one run', async () => {
    const live = complete();
    delete live.tables.ai_usage;
    live.tables.transactions = live.tables.transactions.filter(c => c !== 'plan_id');
    const { code, out } = await check({ ...live, functions: [] });
    expect(out).toContain('missing 3 thing(s)');
    expect(code).toBe(1);
  });

  it('only reads: one call per function, with the public key and the listed arguments', async () => {
    const { seen } = await check(complete());
    const writes = seen.filter(s => s.method !== 'GET');
    expect(writes.map(s => [s.method, s.path, JSON.parse(s.body)])).toEqual(
      Object.entries(server.functions).map(([fn, args]) => ['POST', `/rest/v1/rpc/${fn}`, args]));
    // No user token is ever sent, so a function that needs a signed-in user cannot run.
    expect(seen.every(s => s.authorization === undefined)).toBe(true);
  });

  it('warns instead of failing when the database cannot be reached', async () => {
    // A port nothing listens on.
    const url = await standIn(complete(), []);
    await new Promise<void>(done => api!.close(() => done()));
    api = undefined;
    const { code, out } = await runScript(url);
    expect(out).toContain('Schema check skipped');
    expect(code).toBe(0);
  });
});
