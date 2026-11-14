// Settings that belong to the user, not to the browser: monthly income,
// payday, net worth goal and history, budget templates, rollover categories,
// second currency.
//
// They used to live in localStorage under fixed names, so the next person to
// sign in on the same browser saw the last one's income and templates, and a
// user's settings did not follow them from phone to laptop. They now live in
// one row of public.user_settings per user (data jsonb).
//
// That table arrives with a migration that is applied by hand. Until it
// exists, and whenever the server cannot be reached, the settings are kept in
// this browser under the user's own key (see userStorage.ts) and the app
// carries on without an error. Changes made then are marked unsaved and sent
// the next time the server answers.
//
// A write sends only the keys changed here, and the database merges them into
// the row (merge_user_settings), so a phone or tab holding an old copy cannot
// put its old income or payday back over a newer one. Net worth history is
// merged by month. The row is read again when the app comes back into view.
import type { SupabaseClient } from '@supabase/supabase-js';
import { browserStorage, safeGet, safeRemove, safeSet, userKey } from '@/lib/userStorage';

export interface BudgetTemplateItem { category: string; categoryIcon: string; amount: number; period: string }
export interface BudgetTemplate { name: string; savedAt: string; items: BudgetTemplateItem[] }

export interface KnownSettings {
  monthly_income?: number;
  payday_day?: number;
  net_worth_goal?: number;
  /** Net worth at the end of each month, by "yyyy-MM". */
  net_worth_history?: Record<string, number>;
  budget_templates?: BudgetTemplate[];
  rollover_categories?: string[];
  secondary_currency?: string;
  /** First use: the user chose a currency on the first-run screen. */
  currency_confirmed?: boolean;
  /** First use: the user hid the Getting started card on Home. */
  checklist_dismissed?: boolean;
}
export type SettingKey = keyof KnownSettings;
/** Keys a newer version of the app wrote are kept as they are, so saving here does not drop them. */
export type UserSettings = KnownSettings & { [key: string]: unknown };

// Size caps. The row is read whole on every load, so it must stay small.
// Net worth history: the widget draws the last 7 months; 24 keep two years for
// a year-on-year view at well under 1 KB. Templates: the Budgets page always
// kept the 12 newest. The rest only stop a broken caller from growing the row.
export const NET_WORTH_MONTHS = 24;
export const MAX_TEMPLATES = 12;
const MAX_TEMPLATE_ITEMS = 100;
const MAX_ROLLOVER = 200;
const MAX_TEXT = 100;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_TEXT;

function cleanHistory(v: unknown): Record<string, number> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const months = Object.entries(v as Record<string, unknown>)
    .filter((e): e is [string, number] => /^\d{4}-\d{2}$/.test(e[0]) && isNum(e[1]))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-NET_WORTH_MONTHS);
  return months.length ? Object.fromEntries(months) : undefined;
}

function cleanTemplates(v: unknown): BudgetTemplate[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: BudgetTemplate[] = [];
  for (const t of v) {
    if (!t || typeof t !== 'object') continue;
    const { name, savedAt, items } = t as Record<string, unknown>;
    if (!isText(name) || !Array.isArray(items)) continue;
    const clean = items
      .filter((i): i is BudgetTemplateItem => !!i && typeof i === 'object' && isText(i.category) && isNum(i.amount))
      .slice(0, MAX_TEMPLATE_ITEMS)
      .map(i => ({
        category: i.category,
        categoryIcon: typeof i.categoryIcon === 'string' ? i.categoryIcon : '',
        amount: i.amount,
        period: typeof i.period === 'string' ? i.period : 'monthly',
      }));
    out.push({ name, savedAt: typeof savedAt === 'string' ? savedAt : '', items: clean });
    if (out.length === MAX_TEMPLATES) break;
  }
  return out.length ? out : undefined;
}

/**
 * Keep only values the app can use, within the caps. The row comes from the
 * database and the old values from the browser; neither is trusted to have
 * the right shape. A value that is not usable is dropped, as if never set.
 */
export function sanitizeSettings(raw: unknown): UserSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const known: KnownSettings = {
    monthly_income: isNum(r.monthly_income) && r.monthly_income > 0 ? r.monthly_income : undefined,
    payday_day: isNum(r.payday_day) && Number.isInteger(r.payday_day) && r.payday_day >= 1 && r.payday_day <= 31 ? r.payday_day : undefined,
    net_worth_goal: isNum(r.net_worth_goal) && r.net_worth_goal > 0 ? r.net_worth_goal : undefined,
    net_worth_history: cleanHistory(r.net_worth_history),
    budget_templates: cleanTemplates(r.budget_templates),
    rollover_categories: Array.isArray(r.rollover_categories)
      ? [...new Set(r.rollover_categories.filter(isText))].slice(0, MAX_ROLLOVER)
      : undefined,
    secondary_currency: typeof r.secondary_currency === 'string' && /^[A-Z]{3}$/.test(r.secondary_currency) ? r.secondary_currency : undefined,
    currency_confirmed: r.currency_confirmed === true ? true : undefined,
    checklist_dismissed: r.checklist_dismissed === true ? true : undefined,
  };
  if (known.rollover_categories?.length === 0) known.rollover_categories = undefined;
  const out: UserSettings = {};
  for (const [k, v] of Object.entries(r)) if (!(k in known)) out[k] = v;
  for (const [k, v] of Object.entries(known)) if (v !== undefined) out[k] = v;
  return out;
}

export const isEmptySettings = (s: UserSettings) => Object.keys(s).length === 0;

/** Settings that were kept in the browser before they moved to the database. The first-use flags never were. */
type LegacySettingKey = Exclude<SettingKey, 'currency_confirmed' | 'checklist_dismissed'>;
/**
 * Which user took the old browser values on this browser. They are given to
 * that user only: a later account here never receives them, even when an old
 * copy of the app wrote them again.
 */
export const LEGACY_OWNER_KEY = 'spendpal_legacy_settings_owner';
/** Where each setting was kept in the browser before it moved to the database. */
export const LEGACY_KEYS: Record<LegacySettingKey, string> = {
  monthly_income: 'spendpal_monthly_income',
  payday_day: 'spendpal_payday',
  net_worth_goal: 'spendpal_nw_goal',
  net_worth_history: 'spendpal_networth_history',
  budget_templates: 'spendpal_budget_templates',
  rollover_categories: 'spendpal_rollover_cats',
  secondary_currency: 'secondaryCurrency',
};
const LEGACY_NUMBERS: LegacySettingKey[] = ['monthly_income', 'payday_day', 'net_worth_goal'];
const LEGACY_JSON: LegacySettingKey[] = ['net_worth_history', 'budget_templates', 'rollover_categories'];

/** The settings this browser held under the old fixed names. */
export function readLegacySettings(storage: Storage | null): UserSettings {
  const raw: Record<string, unknown> = {};
  for (const key of LEGACY_NUMBERS) {
    const v = safeGet(storage, LEGACY_KEYS[key]);
    if (v !== null && v.trim() !== '') raw[key] = Number(v);
  }
  for (const key of LEGACY_JSON) {
    const v = safeGet(storage, LEGACY_KEYS[key]);
    if (v === null) continue;
    try { raw[key] = JSON.parse(v); } catch { /* unreadable: dropped */ }
  }
  const cur = safeGet(storage, LEGACY_KEYS.secondary_currency);
  if (cur) raw.secondary_currency = cur;
  return sanitizeSettings(raw);
}

export function removeLegacySettings(storage: Storage | null): void {
  for (const key of Object.values(LEGACY_KEYS)) safeRemove(storage, key);
}

type QueryError = { message: string; code?: string };
export type SettingsResult = { data?: unknown; error: QueryError | null; status?: number };

/** The table was never created: the migration is not applied yet. */
export const isMissingTable = (r: SettingsResult) =>
  !!r.error && (r.status === 404 || r.error.code === 'PGRST205' || r.error.code === '42P01');

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The money amounts among the settings, moved to a new currency at `rate`.
 * Used when every stored amount is converted, so the income, goal, history
 * and templates do not stay in the old currency under the new symbol.
 */
export function convertSettingsAmounts(s: UserSettings, rate: number): Partial<KnownSettings> {
  if (!isNum(rate) || rate <= 0 || rate === 1) return {};
  const patch: Partial<KnownSettings> = {};
  if (s.monthly_income) patch.monthly_income = round2(s.monthly_income * rate);
  if (s.net_worth_goal) patch.net_worth_goal = round2(s.net_worth_goal * rate);
  if (s.net_worth_history) {
    patch.net_worth_history = Object.fromEntries(Object.entries(s.net_worth_history).map(([m, v]) => [m, round2(v * rate)]));
  }
  if (s.budget_templates) {
    patch.budget_templates = s.budget_templates.map(t => ({ ...t, items: t.items.map(i => ({ ...i, amount: round2(i.amount * rate) })) }));
  }
  return patch;
}

/**
 * Net worth months changed here and not sent yet. `cleared`: the whole history
 * was cleared here, so the server's months go too.
 */
export interface UnsavedMonths { months: Iterable<string>; cleared: boolean }

const HISTORY: string = 'net_worth_history';
const pickMonths = (h: Record<string, number> | undefined, months: Iterable<string>) => {
  const out: Record<string, number> = {};
  if (h) for (const m of months) if (m in h) out[m] = h[m];
  return out;
};

/**
 * The server's settings with the changes this browser made but could not
 * send. A key changed here wins, including one that was cleared here. Net
 * worth history is merged by month when `months` says which months changed
 * here: one month recorded here never replaces the server's other months.
 */
export function mergeUnsaved(
  server: UserSettings, local: UserSettings, unsaved: Iterable<string>, months?: UnsavedMonths,
): UserSettings {
  const out: UserSettings = { ...server };
  for (const key of unsaved) {
    if (key === HISTORY && months) {
      const base = months.cleared ? {} : (server.net_worth_history ?? {});
      const merged = { ...base, ...pickMonths(local.net_worth_history, months.months) };
      if (Object.keys(merged).length) out[key] = merged;
      else delete out[key];
      continue;
    }
    if (key in local) out[key] = local[key];
    else delete out[key];
  }
  return sanitizeSettings(out);
}

/**
 * The two calls the store makes, so tests can stand in for the database.
 * save() sends the changed keys (`patch`) and the cleared ones (`removed`);
 * the server merges them into the row and answers with the whole row in
 * `data`. net_worth_history in a patch adds or replaces those months only.
 */
export interface SettingsBackend {
  load(userId: string): Promise<SettingsResult>;
  save(userId: string, patch: UserSettings, removed: string[]): Promise<SettingsResult>;
}

export function supabaseSettingsBackend(client: SupabaseClient): SettingsBackend {
  return {
    load: async userId => client.from('user_settings').select('data').eq('user_id', userId).maybeSingle(),
    // Merged in the database (section 22j), in one statement, so a write from
    // another device in between is kept. The user is the caller's own.
    save: async (_userId, patch, removed) => client.rpc('merge_user_settings', { patch, removed }),
  };
}

/**
 * 'loading': the row has not answered yet; values come from this browser's copy.
 * 'server': the row is loaded and changes are sent to it.
 * 'local': the server did not answer; changes stay here and are sent later.
 * 'missing': the table does not exist yet; changes stay here.
 */
export type SettingsMode = 'loading' | 'server' | 'local' | 'missing';
/** `userId`: whose settings these are; null when signed out. */
export interface SettingsSnapshot { userId: string | null; data: UserSettings; ready: boolean; mode: SettingsMode }

const CACHE_NAME = 'settings';
interface Cached { data: UserSettings; unsaved: string[]; months?: string[]; cleared?: boolean }

export interface StoreOptions {
  backend: () => SettingsBackend;
  storage: () => Storage | null;
  /** How long to wait after a change before sending it. A slider sends once, not per step. */
  debounceMs?: number;
}

export function createUserSettingsStore(opts: StoreOptions) {
  const debounceMs = opts.debounceMs ?? 800;
  let userId: string | null = null;
  // Bumped on every start, stop and discard, so an answer for an earlier
  // sign-in is dropped instead of landing in the next user's settings.
  let gen = 0;
  let snap: SettingsSnapshot = { userId: null, data: {}, ready: false, mode: 'loading' };
  let unsaved = new Set<string>();
  // Net worth months changed here, and whether the history was cleared here.
  let unsavedMonths = new Set<string>();
  let historyCleared = false;
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<boolean> | null = null;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const emit = (next: Partial<SettingsSnapshot>) => {
    snap = { ...snap, ...next };
    listeners.forEach(l => l());
  };
  const cacheKey = (uid: string) => userKey(uid, CACHE_NAME);
  const readCache = (uid: string): Cached | null => {
    const raw = safeGet(opts.storage(), cacheKey(uid));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<Cached>;
      const data = sanitizeSettings(parsed.data);
      const strings = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []);
      const keys = strings(parsed.unsaved);
      // A copy from before months were tracked: every month it holds was changed here.
      const months = Array.isArray(parsed.months) ? strings(parsed.months)
        : keys.includes(HISTORY) ? Object.keys(data.net_worth_history ?? {}) : [];
      return { data, unsaved: keys, months, cleared: parsed.cleared === true };
    } catch { return null; }
  };
  const writeCache = () => {
    if (!userId) return false;
    const copy: Cached = { data: snap.data, unsaved: [...unsaved], months: [...unsavedMonths], cleared: historyCleared };
    return safeSet(opts.storage(), cacheKey(userId), JSON.stringify(copy));
  };
  const resetUnsaved = (c?: Cached | null) => {
    unsaved = new Set(c?.unsaved ?? []);
    unsavedMonths = new Set(c?.months ?? []);
    historyCleared = c?.cleared ?? false;
  };
  const monthsState = (): UnsavedMonths => ({ months: unsavedMonths, cleared: historyCleared });
  /** What goes to the server: the changed keys, and the ones cleared here. */
  const pending = () => {
    const patch: UserSettings = {};
    const removed: string[] = [];
    for (const key of unsaved) {
      if (key === HISTORY) {
        if (historyCleared) removed.push(key);
        const months = pickMonths(snap.data.net_worth_history, unsavedMonths);
        if (Object.keys(months).length) patch[key] = months;
      } else if (key in snap.data) patch[key] = snap.data[key];
      else removed.push(key);
    }
    return { patch, removed };
  };
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };

  async function flush(): Promise<boolean> {
    clearTimer();
    if (inflight) {
      // One request at a time. Whatever changed meanwhile goes in the next one.
      await inflight;
      return unsaved.size === 0 ? true : flush();
    }
    if (!userId || unsaved.size === 0) return true;
    if (snap.mode === 'missing' || snap.mode === 'loading') return false;
    if (snap.mode === 'local') {
      // The row was never read this session: read it first, so the screen
      // shows what other devices saved; load() then sends the unsaved changes.
      await load(userId, gen, true);
      return unsaved.size === 0;
    }
    const uid = userId, g = gen, sentVersion = version;
    const { patch, removed } = pending();
    inflight = (async () => {
      let res: SettingsResult;
      try { res = await opts.backend().save(uid, patch, removed); }
      catch (e) { res = { error: { message: e instanceof Error ? e.message : String(e) } }; }
      if (g !== gen) return false;
      if (!res.error) {
        // A change made while the request was out is still unsaved.
        if (version === sentVersion) resetUnsaved();
        // The answer is the whole row, other devices' changes included.
        if (res.data && typeof res.data === 'object') {
          emit({ data: mergeUnsaved(sanitizeSettings(res.data), snap.data, unsaved, monthsState()) });
        }
        writeCache();
        if (snap.mode !== 'server') emit({ mode: 'server' });
        return true;
      }
      // Kept on screen and in this browser; the next change sends it again.
      if (isMissingTable(res)) emit({ mode: 'missing' });
      writeCache();
      return false;
    })();
    try { return await inflight; } finally { inflight = null; }
  }

  const schedule = () => {
    clearTimer();
    timer = setTimeout(() => { void flush(); }, debounceMs);
  };

  let reading = false;
  async function load(uid: string, g: number, hadCache: boolean) {
    const storage = opts.storage();
    let res: SettingsResult;
    reading = true;
    try { res = await opts.backend().load(uid); }
    catch (e) { res = { error: { message: e instanceof Error ? e.message : String(e) } }; }
    finally { reading = false; }
    if (g !== gen) return;

    if (res.error) {
      // No error on screen: the settings this browser holds are used for now,
      // and the row is read again when the app comes back into view.
      // 'local' is not 'server': the row was not read, so a caller that adds
      // to a saved value (NetWorthWidget) waits.
      const missing = isMissingTable(res);
      // With no table there is no row to hold anything yet. With no answer
      // the row may have values; the old ones wait for a load that works.
      if (missing && !hadCache) adoptLegacy(storage, uid);
      emit({ ready: true, mode: missing ? 'missing' : 'local' });
      return;
    }

    // The row is the truth, except for changes this browser could not send.
    // A synced value the row no longer has was deleted elsewhere (Delete
    // Everything on another device) and must not come back from here.
    const server = sanitizeSettings((res.data as { data?: unknown } | null)?.data);
    emit({ data: mergeUnsaved(server, snap.data, unsaved, monthsState()), ready: true, mode: 'server' });
    // What this browser held under the old names, for any key the row does
    // not have yet (a second device's templates and history too).
    adoptLegacy(storage, uid);
    writeCache();
    if (unsaved.size) await flush();
  }

  /**
   * Take the values kept under the old fixed names, for keys the settings do
   * not have yet (the row wins; net worth history gains the missing months),
   * then remove them so they are read only this once. They go to the first
   * account that takes them on this browser and never to another one.
   */
  function adoptLegacy(storage: Storage | null, uid: string) {
    const legacy = readLegacySettings(storage);
    if (isEmptySettings(legacy)) return;
    const owner = safeGet(storage, LEGACY_OWNER_KEY);
    if (owner && owner !== uid) { removeLegacySettings(storage); return; }
    const next: UserSettings = { ...snap.data };
    let changed = false;
    for (const [k, v] of Object.entries(legacy)) {
      if (k === HISTORY) {
        const have = next.net_worth_history ?? {};
        const add = Object.entries(v as Record<string, number>).filter(([m]) => !(m in have));
        if (!add.length) continue;
        next.net_worth_history = { ...have, ...Object.fromEntries(add) };
        for (const [m] of add) unsavedMonths.add(m);
      } else if (k in next) continue;
      else next[k] = v;
      unsaved.add(k);
      changed = true;
    }
    if (changed) {
      version++;
      emit({ data: sanitizeSettings(next) });
    }
    if (writeCache() && safeSet(storage, LEGACY_OWNER_KEY, uid)) removeLegacySettings(storage);
  }

  const store = {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: (): SettingsSnapshot => snap,
    get<K extends SettingKey>(key: K): KnownSettings[K] {
      return snap.data[key] as KnownSettings[K];
    },
    /** Load this user's settings. Called on every sign-in; a repeat for the same user does nothing. */
    start(uid: string): Promise<void> {
      if (userId === uid && loading) return loading;
      if (userId) store.stop();
      userId = uid;
      const g = ++gen;
      const cached = readCache(uid);
      resetUnsaved(cached);
      emit({ userId: uid, data: cached?.data ?? {}, ready: false, mode: 'loading' });
      loading = load(uid, g, cached !== null);
      return loading;
    },
    /**
     * Sign-out: forget this user's settings in memory. The browser copy goes
     * too once everything in it reached the server; when it did not, it is
     * the only copy and stays, under this user's own key, for their next sign-in.
     */
    stop(): void {
      clearTimer();
      gen++;
      if (userId && unsaved.size === 0 && snap.mode === 'server') safeRemove(opts.storage(), cacheKey(userId));
      userId = null;
      loading = null;
      resetUnsaved();
      emit({ userId: null, data: {}, ready: false, mode: 'loading' });
    },
    set<K extends SettingKey>(key: K, value: KnownSettings[K] | null | undefined): void {
      store.update({ [key]: value ?? undefined } as Partial<KnownSettings>);
    },
    /**
     * Change several settings in one write. `undefined` clears a setting.
     * net_worth_history adds or replaces the months given and keeps the rest.
     */
    update(patch: Partial<KnownSettings>): void {
      if (!userId || Object.keys(patch).length === 0) return;
      const next: UserSettings = { ...snap.data };
      for (const [k, v] of Object.entries(patch)) {
        if (k === HISTORY && v !== undefined) {
          next[k] = { ...(next.net_worth_history ?? {}), ...(v as Record<string, number>) };
          for (const m of Object.keys(v as Record<string, number>)) unsavedMonths.add(m);
        } else if (v === undefined) {
          delete next[k];
          if (k === HISTORY) { historyCleared = true; unsavedMonths.clear(); }
        } else next[k] = v;
        unsaved.add(k);
      }
      version++;
      emit({ data: sanitizeSettings(next) });
      writeCache();
      schedule();
    },
    /** Send any waiting change now. True when nothing is left unsaved. */
    flush,
    /**
     * Read the row again: another device may have changed it, or the first
     * read failed. Called when the app comes back into view or online.
     */
    async refresh(): Promise<void> {
      if (!userId || reading || inflight || snap.mode === 'loading' || snap.mode === 'missing') return;
      await load(userId, gen, true);
    },
    /**
     * Delete Everything: drop every waiting change and the browser copy, and
     * stop saving, so a late write cannot put back the row being deleted.
     * start() again if the delete fails.
     */
    async discard(): Promise<void> {
      clearTimer();
      gen++;
      if (inflight) { try { await inflight; } catch { /* dropped anyway */ } }
      if (userId) safeRemove(opts.storage(), cacheKey(userId));
      userId = null;
      loading = null;
      resetUnsaved();
      emit({ userId: null, data: {}, ready: false, mode: 'loading' });
    },
  };
  return store;
}

export type UserSettingsStore = ReturnType<typeof createUserSettingsStore>;

// Imported lazily so this file can be loaded (and tested) without the client.
let backend: SettingsBackend | null = null;
export const userSettings = createUserSettingsStore({
  backend: () => {
    if (!backend) throw new Error('user settings: no backend');
    return backend;
  },
  storage: browserStorage,
});
/** Called once by the auth context with the app's Supabase client. */
export const connectUserSettings = (client: SupabaseClient) => { backend = supabaseSettingsBackend(client); };

/**
 * Read the row again whenever the app comes back into view or online, so a
 * phone kept in memory shows what the laptop saved meanwhile.
 */
export function refreshUserSettingsOnReturn(store: Pick<UserSettingsStore, 'refresh'> = userSettings): () => void {
  if (typeof window === 'undefined') return () => {};
  const onVisible = () => { if (document.visibilityState === 'visible') void store.refresh(); };
  const onOnline = () => { void store.refresh(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  };
}
