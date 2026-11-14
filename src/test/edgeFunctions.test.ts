// Rules the edge functions must keep. They run on Deno and cannot be started
// here, so these tests read their source and test the shared pure code.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { APP_ORIGIN, corsHeadersFor, pickOrigin } from '../../supabase/functions/_shared/cors';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const functionsDir = join(root, 'supabase/functions');
const functionNames = readdirSync(functionsDir)
  .filter(name => !name.startsWith('_') && statSync(join(functionsDir, name)).isDirectory());

describe('CORS', () => {
  it('answers the app and a local dev server with their own origin', () => {
    expect(pickOrigin('https://spendpal.vercel.app')).toBe('https://spendpal.vercel.app');
    expect(pickOrigin('http://localhost:8080')).toBe('http://localhost:8080');
    expect(pickOrigin('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173');
  });

  it('answers any other page with the app origin, so the browser blocks it', () => {
    expect(pickOrigin('https://evil.example')).toBe(APP_ORIGIN);
    expect(pickOrigin('https://spendpal.vercel.app.evil.example')).toBe(APP_ORIGIN);
    expect(pickOrigin('http://localhost.evil.example')).toBe(APP_ORIGIN);
    expect(pickOrigin('https://localhost:8080')).toBe(APP_ORIGIN);
    expect(pickOrigin(null)).toBe(APP_ORIGIN);
  });

  it('accepts more origins from the ALLOWED_ORIGINS secret', () => {
    expect(pickOrigin('https://app.example.com', 'https://app.example.com, https://b.example')).toBe('https://app.example.com');
    expect(pickOrigin('https://c.example', 'https://app.example.com')).toBe(APP_ORIGIN);
  });

  it('never sends a wildcard, and tells caches the answer depends on the origin', () => {
    const headers = corsHeadersFor('https://evil.example');
    expect(headers['Access-Control-Allow-Origin']).toBe(APP_ORIGIN);
    expect(headers['Vary']).toBe('Origin');
  });

  it('every function takes its CORS headers from the shared file', () => {
    expect(functionNames).toEqual(expect.arrayContaining(['ai-finance', 'delete-account', 'send-notification']));
    for (const name of functionNames) {
      const src = read(`supabase/functions/${name}/index.ts`);
      expect(src, name).toContain('corsHeadersFor(req.headers.get("Origin")');
      expect(src, name).not.toMatch(/Access-Control-Allow-Origin"\s*:\s*"\*"/);
    }
  });
});

describe('ai-finance', () => {
  const src = read('supabase/functions/ai-finance/index.ts');

  it('counts the call before it talks to the model', () => {
    const counted = src.indexOf('await countCall(');
    const model = src.indexOf('new Anthropic(');
    expect(counted).toBeGreaterThan(0);
    expect(model).toBeGreaterThan(counted);
  });

  it('refuses with 503 when the counter fails, and with 429 at the limit', () => {
    expect(src).toContain('return reply(503, { error: METER_DOWN });');
    expect(src).toContain('return reply(429, { error: refusalMessage(counted.reason), remaining: 0 });');
  });

  it('no longer asks for 16000 tokens on every request', () => {
    expect(src).not.toContain('max_tokens: 16000');
    expect(src).toContain('max_tokens: MAX_TOKENS[requestType]');
  });

  it('still uses the same model, fallback beta and effort settings', () => {
    expect(src).toContain('const MODEL = "claude-opus-5-5";');
    expect(src).toContain('betas: ["server-side-fallback-2026-07-01"]');
    expect(src).toContain('fallbacks: "default"');
    expect(src).toContain('? { effort: "medium", format: { type: "json_schema", schema: outputSchema } }');
    expect(src).toContain(': { effort: "low" }');
  });
});

describe('send-notification', () => {
  const src = read('supabase/functions/send-notification/index.ts');

  it('takes a budget id and a threshold, not a subject and a message', () => {
    expect(src).toContain('const { budget_id, threshold } = payload');
    expect(src).not.toMatch(/\bsubject\s*,\s*message\b/);
    expect(src).not.toContain('NotificationPayload');
  });

  it('has no SMS branch and does not trust the phone-verified flag', () => {
    expect(src).not.toMatch(/twilio/i);
    expect(src).not.toContain('phone_verified_at');
    expect(src).not.toContain('phone_number');
  });

  it('does not send from or link to the domain that does not exist', () => {
    expect(src).not.toContain('spendpal.app');
    expect(src).toContain('Deno.env.get("ALERT_FROM_EMAIL")');
  });

  it('writes the log row before it counts and before it sends', () => {
    const logged = src.indexOf('.insert({ user_id: user.id, channel: "email" })');
    const counted = src.indexOf('if (count > EMAIL_PER_DAY)');
    const sent = src.indexOf('fetch("https://api.resend.com/emails"');
    expect(logged).toBeGreaterThan(0);
    expect(counted).toBeGreaterThan(logged);
    expect(sent).toBeGreaterThan(counted);
  });
});

describe('delete-account', () => {
  const src = read('supabase/functions/delete-account/index.ts');

  it('removes the avatar files before it deletes the login', () => {
    const files = src.indexOf('await emptyFolder(user.id, 0)');
    const login = src.indexOf('admin.auth.admin.deleteUser(user.id)');
    expect(files).toBeGreaterThan(0);
    expect(login).toBeGreaterThan(files);
  });

  it('takes the user id from the verified token only', () => {
    expect(src).not.toContain('req.json()');
    expect(src).not.toContain('req.text()');
  });
});

describe('deploy workflow', () => {
  it('deploys every function in supabase/functions', () => {
    const workflow = read('.github/workflows/deploy-functions.yml');
    for (const name of functionNames) {
      expect(workflow, name).toContain(`supabase functions deploy ${name} `);
    }
  });
});

describe('Settings notifications', () => {
  const settings = read('src/pages/Settings.tsx');

  it('does not offer SMS alerts or alerts while the app is closed', () => {
    expect(settings).not.toMatch(/SMS/);
    expect(settings).not.toContain('even when the app is closed');
    expect(settings).not.toContain('by email or text');
  });
});
