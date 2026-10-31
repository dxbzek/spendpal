// Screenshots of every signed-in screen, without a real account.
//
// Serves the production build (dist/, so run `npm run build` first), fakes
// the Supabase backend in the browser with the sample data below, and saves
// each page at phone and desktop width in light and dark to screens/.
//
//   npm run build && node scripts/screens.mjs [route ...]
//
// Writes are answered with an empty success, so tapping around works but
// nothing persists. Chromium comes from Playwright.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const client = readFileSync(new URL('src/integrations/supabase/client.ts', root), 'utf8');
const SUPABASE_URL = client.match(/VITE_SUPABASE_URL\s*\|\|\s*'([^']+)'/)[1];
const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const PORT = 4179;
const OUT = new URL('screens/', root);

const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : [
  '/', '/transactions', '/budgets', '/goals', '/accounts', '/reports',
  '/debt', '/installments', '/calendar', '/advisor', '/settings',
];
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 860 } };

// ── Sample data ────────────────────────────────────────────────────────────
const USER_ID = '00000000-0000-4000-8000-000000000001';
const now = new Date();
const iso = d => d.toISOString();
const day = n => { const d = new Date(now); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const monthKey = (offset = 0) => { const d = new Date(now.getFullYear(), now.getMonth() + offset, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const stamp = { created_at: iso(now), updated_at: iso(now), user_id: USER_ID };

const accounts = [
  { id: 'a1', name: 'BDO Savings', type: 'debit', balance: 48250.4, icon: '🏦' },
  { id: 'a2', name: 'GCash', type: 'cash', balance: 3120, icon: '💵' },
  { id: 'a3', name: 'BPI Credit Card', type: 'credit', balance: 12480.75, icon: '💳', credit_limit: 60000, due_date: 15, statement_date: 22, apr: 36 },
  { id: 'a4', name: 'Atome', type: 'credit', balance: 854.7, icon: '🛍️', credit_limit: 10000, apr: 0 },
  { id: 'a5', name: 'Home Credit', type: 'credit', balance: 6400, icon: '🏦', credit_limit: 20000, apr: 24, statement_min_due: 640 },
].map(a => ({ currency: 'PHP', credit_limit: null, due_date: null, statement_date: null, apr: null,
  statement_total_due: null, statement_min_due: null, statement_due_on: null, exclude_from_spendable: false, ...stamp, ...a }));

const spends = [
  ['Groceries', '🛒', 'SM Supermarket', 2340.5, 'a1'], ['Dining', '🍽️', 'Jollibee', 389, 'a2'],
  ['Coffee', '☕', 'Starbucks', 210, 'a3'], ['Transport', '🚗', 'Grab', 245, 'a2'],
  ['Subscriptions', '🔄', 'Netflix', 549, 'a3'], ['Utilities', '🔌', 'Meralco', 3120.8, 'a1'],
  ['Telecom', '📱', 'Globe Postpaid', 1299, 'a3'], ['Shopping', '🛍️', 'Uniqlo', 1990, 'a3'],
  ['Health', '🏥', 'Mercury Drug', 640.25, 'a2'], ['Dining', '🍽️', 'Mang Inasal', 299, 'a2'],
  ['Groceries', '🛒', 'Puregold', 1785, 'a1'], ['Fitness', '🏋️', 'Anytime Fitness', 2500, 'a3'],
];
const transactions = [];
for (let i = 0; i < 45; i++) {
  const [category, category_icon, merchant, amount, account_id] = spends[i % spends.length];
  transactions.push({ id: `t${i}`, type: 'expense', category, category_icon, merchant, amount: Math.round(amount * (0.8 + (i % 5) / 10) * 100) / 100, account_id, date: day(i * 1.3 | 0) });
}
transactions.push(
  { id: 'in1', type: 'income', category: 'Salary', category_icon: '💰', merchant: 'Acme Corp', amount: 45000, account_id: 'a1', date: day(3) },
  { id: 'in2', type: 'income', category: 'Salary', category_icon: '💰', merchant: 'Acme Corp', amount: 45000, account_id: 'a1', date: day(33) },
  { id: 'in3', type: 'income', category: 'Freelance', category_icon: '💻', merchant: 'Upwork', amount: 8200, account_id: 'a2', date: day(12) },
  { id: 'inst1', type: 'expense', category: 'Shopping', category_icon: '🛍️', merchant: 'Lazada iPhone', amount: 4166.67, account_id: 'a3', date: day(8), total_installments: 12, current_installment: 4, loan_total_amount: 50000 },
);
const txRows = transactions.map(t => ({ currency: 'PHP', note: null, is_recurring: false, total_installments: null, current_installment: null,
  loan_total_amount: null, is_tracking_only: false, is_internal: false, is_pending: false, remaining_principal: null, dupe_dismissed: false, ...stamp, ...t }));

const budgetRows = (month, offset) => [
  ['Groceries', '🛒', 8000], ['Dining', '🍽️', 4000], ['Transport', '🚗', 2500],
  ['Subscriptions', '🔄', 1200], ['Shopping', '🛍️', 3000], ['Coffee', '☕', 1000],
].map(([category, category_icon, amount], i) => ({ id: `b${offset}${i}`, category, category_icon, amount, period: 'monthly', month, is_fixed: false, ...stamp }));
const budgets = [...budgetRows(monthKey(0), 0), ...budgetRows(monthKey(-1), 1)];

const goals = [
  { id: 'g1', name: 'Emergency fund (3 months)', icon: '🛡️', type: 'savings', target_amount: 135000, saved_amount: 42000, deadline: day(-240), status: 'active' },
  { id: 'g2', name: 'Pay off credit card', icon: '💳', type: 'debt', target_amount: 17845.72, saved_amount: 5685.82, deadline: day(-61), status: 'active' },
  { id: 'g3', name: 'Wedding package', icon: '💍', type: 'savings', target_amount: 250000, saved_amount: 40000, deadline: day(-361), status: 'active' },
].map(g => ({ ...stamp, ...g }));

// The app validates ids as UUIDs; derive stable ones from the short ids above.
const uuid = id => `00000000-0000-4000-8000-${Buffer.from(id).toString('hex').padStart(12, '0').slice(-12)}`;
for (const rows of [accounts, txRows, budgets, goals]) {
  for (const r of rows) {
    r.id = uuid(r.id);
    if (r.account_id) r.account_id = uuid(r.account_id);
  }
}

const TABLES = {
  accounts, transactions: txRows, budgets, goals, goal_contributions: [], custom_categories: [], advisor_sessions: [],
  profiles: [{ id: uuid('p1'), display_name: 'Zek', currency: 'PHP', avatar_url: null, notify_email: false, notify_sms: false, phone_number: null, ...stamp }],
};

// ── Fake session ───────────────────────────────────────────────────────────
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'demo@spendpal.app', app_metadata: {}, user_metadata: { display_name: 'Zek' }, created_at: iso(now) };
const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, exp, role: 'authenticated', aud: 'authenticated' })}.sig`;
const session = { access_token, refresh_token: 'demo', token_type: 'bearer', expires_in: 86400, expires_at: exp, user };

async function fakeBackend(route) {
  const req = route.request();
  const url = new URL(req.url());
  const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname.startsWith('/auth/v1/user')) return json(user);
  if (url.pathname.startsWith('/auth/v1/token')) return json(session);
  if (url.pathname.startsWith('/auth/v1/')) return json({});
  if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
  if (url.pathname.startsWith('/functions/v1/')) return json({});
  if (url.pathname.startsWith('/storage/')) return route.fulfill({ status: 404, body: '' });
  const table = url.pathname.replace('/rest/v1/', '');
  if (req.method() !== 'GET' && req.method() !== 'HEAD') return json(req.method() === 'DELETE' ? [] : JSON.parse(req.postData() || '[]'));
  const rows = url.searchParams.get('limit') === '0' ? [] : (TABLES[table] ?? []);
  const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  return json(single ? rows[0] ?? null : rows);
}

// ── Run ────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
// BASE_URL screenshots a deployed site instead of the local build.
const base = process.env.BASE_URL || `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) {
  try { await fetch(base); break; } catch { await new Promise(r => setTimeout(r, 250)); }
}

// CHROMIUM_PATH points at an already-installed Chrome when Playwright's own download is missing.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const theme of ['light', 'dark']) {
    for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block' });
      await context.route(`${SUPABASE_URL}/**`, fakeBackend);
      // BLOCK_ASSET=<substring> fails matching asset requests, the way a page
      // left open across a deploy fails to find renamed chunks.
      if (process.env.BLOCK_ASSET) await context.route(u => u.pathname.includes(process.env.BLOCK_ASSET), r => r.abort());
      await context.route('https://open.er-api.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rates: { PHP: 1, AED: 0.0634, USD: 0.0173 } }) }));
      await context.addInitScript(([key, s, t]) => {
        localStorage.setItem(key, s);
        localStorage.setItem('theme', t);
        localStorage.setItem('theme-user-set', '1');
      }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
      const page = await context.newPage();
      page.on('pageerror', err => console.error(`  page error: ${err.stack || err.message}`));
      for (const route of ROUTES) {
        await page.goto(base + route, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        // The app scrolls an inner container, so a full-page shot stops at the
        // fold. SHOT_OF=<text> saves just the card containing that text.
        const card = process.env.SHOT_OF
          ? page.locator('.card-shadow', { hasText: process.env.SHOT_OF }).last()
          : null;
        const name = `${(route === '/' ? 'home' : route.slice(1)).replace(/\//g, '-')}-${vpName}-${theme}.png`;
        const path = fileURLToPath(new URL(name, OUT));
        await (card ? card.screenshot({ path }) : page.screenshot({ path, fullPage: true }));
        console.log(name);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
