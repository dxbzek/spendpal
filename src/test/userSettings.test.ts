// Settings that are the user's data (income, payday, templates, net worth)
// used to sit in localStorage under fixed names: the next account on the same
// browser read the last one's, and nothing followed the user to a second device.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createUserSettingsStore, supabaseSettingsBackend, sanitizeSettings, readLegacySettings, convertSettingsAmounts, mergeUnsaved,
  isMissingTable, NET_WORTH_MONTHS, MAX_TEMPLATES, LEGACY_KEYS, LEGACY_OWNER_KEY,
  type SettingsBackend, type SettingsResult, type UserSettings,
} from '@/lib/userSettings';
import { userKey } from '@/lib/userStorage';

const A = 'user-a';
const B = 'user-b';
const MISSING: SettingsResult = { data: null, error: { message: "Could not find the table 'public.user_settings'", code: 'PGRST205' }, status: 404 };

/**
 * A user_settings table in memory, with switches for the failures that
 * matter. save() merges like merge_user_settings in the migration: the
 * removed keys go, the patch keys are set, net worth history by month.
 */
function fakeBackend() {
  const rows = new Map<string, UserSettings>();
  const state = { missing: false, down: false, saves: [] as Array<{ userId: string; data: UserSettings; removed: string[] }> };
  const backend: SettingsBackend = {
    load: async userId => {
      if (state.missing) return MISSING;
      if (state.down) return { data: null, error: { message: 'Failed to fetch' } };
      const data = rows.get(userId);
      return { data: data ? { data: structuredClone(data) } : null, error: null, status: 200 };
    },
    save: async (userId, patch, removed) => {
      if (state.missing) return MISSING;
      if (state.down) return { data: null, error: { message: 'Failed to fetch' } };
      state.saves.push({ userId, data: structuredClone(patch), removed: [...removed] });
      const row: UserSettings = { ...(rows.get(userId) ?? {}) };
      for (const k of removed) delete row[k];
      for (const [k, v] of Object.entries(structuredClone(patch))) {
        row[k] = k === 'net_worth_history' ? { ...(row.net_worth_history ?? {}), ...(v as Record<string, number>) } : v;
      }
      rows.set(userId, row);
      return { data: structuredClone(row), error: null, status: 200 };
    },
  };
  return { backend, rows, state };
}

const setup = () => {
  const db = fakeBackend();
  const store = createUserSettingsStore({ backend: () => db.backend, storage: () => localStorage, debounceMs: 500 });
  return { db, store };
};

/** What a browser held before this change, for the person who uses it. */
const fillLegacy = () => {
  localStorage.setItem(LEGACY_KEYS.monthly_income, '10000');
  localStorage.setItem(LEGACY_KEYS.payday_day, '30');
  localStorage.setItem(LEGACY_KEYS.secondary_currency, 'PHP');
  localStorage.setItem(LEGACY_KEYS.budget_templates, JSON.stringify([
    { name: 'October 2026', savedAt: '2026-10-01', items: [{ category: 'Food', categoryIcon: 'f', amount: 1200, period: 'monthly' }] },
  ]));
  localStorage.setItem(LEGACY_KEYS.rollover_categories, JSON.stringify(['Food']));
};

beforeEach(() => { localStorage.clear(); vi.useRealTimers(); });
afterEach(() => vi.useRealTimers());

describe('two accounts on one browser', () => {
  it('B never sees what A saved, and sign-out forgets A in memory', async () => {
    const { store } = setup();
    await store.start(A);
    store.set('monthly_income', 10000);
    store.set('payday_day', 30);
    await store.flush();

    store.stop();
    expect(store.getSnapshot().data).toEqual({});

    await store.start(B);
    expect(store.get('monthly_income')).toBeUndefined();
    expect(store.get('payday_day')).toBeUndefined();
  });

  it('keeps no copy of a signed-out user whose settings all reached the server', async () => {
    const { store } = setup();
    await store.start(A);
    store.set('monthly_income', 10000);
    await store.flush();
    store.stop();
    expect(Object.keys(localStorage).filter(k => k.includes(A))).toEqual([]);
  });

  it('drops an answer for A that arrives after B signed in', async () => {
    const { db, store } = setup();
    db.rows.set(A, { monthly_income: 10000 });
    let release!: () => void;
    const slow = db.backend.load;
    db.backend.load = userId => new Promise(res => { release = () => res(slow(userId)); });
    const loadingA = store.start(A);
    db.backend.load = slow;
    await store.start(B);
    release();
    await loadingA;
    expect(store.getSnapshot().userId).toBe(B);
    expect(store.get('monthly_income')).toBeUndefined();
  });
});

describe('settings follow the user', () => {
  it('load from the row on another device', async () => {
    const { db, store } = setup();
    db.rows.set(A, { monthly_income: 15000, secondary_currency: 'USD' });
    await store.start(A);
    expect(store.get('monthly_income')).toBe(15000);
    expect(store.get('secondary_currency')).toBe('USD');
    expect(store.getSnapshot().ready).toBe(true);
  });
});

describe('moving the old browser values', () => {
  it('copies them into an empty row once, then stops reading the old keys', async () => {
    fillLegacy();
    const { db, store } = setup();
    await store.start(A);

    expect(db.rows.get(A)).toMatchObject({
      monthly_income: 10000, payday_day: 30, secondary_currency: 'PHP', rollover_categories: ['Food'],
    });
    expect(db.rows.get(A)!.budget_templates![0].items[0].amount).toBe(1200);
    for (const key of Object.values(LEGACY_KEYS)) expect(localStorage.getItem(key)).toBeNull();
    expect(db.state.saves).toHaveLength(1);

    // The next account on this browser starts empty.
    store.stop();
    await store.start(B);
    expect(store.getSnapshot().data).toEqual({});
    expect(db.rows.get(B)).toBeUndefined();
  });

  it('a second device adds the values the row does not have yet, and the row wins the rest', async () => {
    // Review: the second device's templates and history were never read.
    fillLegacy();
    localStorage.setItem(LEGACY_KEYS.net_worth_history, JSON.stringify({ '2026-08': 1, '2026-09': 2 }));
    const { db, store } = setup();
    db.rows.set(A, { monthly_income: 15000, net_worth_history: { '2026-09': 20, '2026-10': 30 } });
    await store.start(A);
    expect(db.rows.get(A)).toMatchObject({
      monthly_income: 15000, payday_day: 30, secondary_currency: 'PHP',
      net_worth_history: { '2026-08': 1, '2026-09': 20, '2026-10': 30 },
    });
    expect(db.rows.get(A)!.budget_templates![0].name).toBe('October 2026');
    for (const key of Object.values(LEGACY_KEYS)) expect(localStorage.getItem(key)).toBeNull();
  });

  it('never gives them to another account, even when an old copy of the app writes them again', async () => {
    // Review: they stayed when the row had data, and the next account took them.
    fillLegacy();
    const { db, store } = setup();
    db.rows.set(A, { monthly_income: 15000, payday_day: 28 });
    await store.start(A);
    store.stop();
    expect(localStorage.getItem(LEGACY_KEYS.monthly_income)).toBeNull();
    expect(localStorage.getItem(LEGACY_OWNER_KEY)).toBe(A);

    fillLegacy(); // the old build, still open in a tab
    await store.start(B);
    expect(store.getSnapshot().data).toEqual({});
    expect(db.rows.get(B)).toBeUndefined();
    expect(localStorage.getItem(LEGACY_KEYS.monthly_income)).toBeNull();
  });

  it('keeps them for the user, under their own key, while the table does not exist', async () => {
    fillLegacy();
    const { db, store } = setup();
    db.state.missing = true;
    await store.start(A);
    expect(store.getSnapshot().mode).toBe('missing');
    expect(store.get('payday_day')).toBe(30);
    // Out of the shared names, into A's.
    expect(localStorage.getItem(LEGACY_KEYS.payday_day)).toBeNull();
    expect(localStorage.getItem(userKey(A, 'settings'))).toContain('"payday_day":30');

    // Signing out keeps that copy: it is the only one.
    store.stop();
    await store.start(B);
    expect(store.get('payday_day')).toBeUndefined();
    store.stop();

    // The migration is applied: A's next sign-in sends the copy to the row.
    db.state.missing = false;
    await store.start(A);
    expect(db.rows.get(A)).toMatchObject({ payday_day: 30, monthly_income: 10000 });
  });
});

describe('before the migration, or with no connection', () => {
  it('works from this browser and shows no error when the table is missing', async () => {
    const { db, store } = setup();
    db.state.missing = true;
    await store.start(A);
    store.set('monthly_income', 9000);
    expect(store.get('monthly_income')).toBe(9000);
    await expect(store.flush()).resolves.toBe(false);
    expect(db.state.saves).toHaveLength(0);
  });

  it('keeps a change made offline and sends it when the server answers, over the row', async () => {
    const { db, store } = setup();
    db.rows.set(A, { monthly_income: 10000, payday_day: 28 });
    await store.start(A);
    db.state.down = true;
    store.set('payday_day', 30);
    await store.flush();
    expect(store.get('payday_day')).toBe(30);
    store.stop();

    // Another device changed the income meanwhile.
    db.rows.set(A, { monthly_income: 12000, payday_day: 28 });
    db.state.down = false;
    await store.start(A);
    expect(db.rows.get(A)).toEqual({ monthly_income: 12000, payday_day: 30 });
  });

  it('a value deleted elsewhere does not come back from this browser copy', async () => {
    const { db, store } = setup();
    db.rows.set(A, { monthly_income: 10000 });
    await store.start(A);
    // A never signed out here, so the synced copy stays in the browser.
    db.rows.set(A, {});
    store.stop();
    localStorage.setItem(userKey(A, 'settings'), JSON.stringify({ data: { monthly_income: 10000 }, unsaved: [] }));
    await store.start(A);
    expect(store.get('monthly_income')).toBeUndefined();
    expect(db.state.saves).toHaveLength(0);
  });
});

describe('two devices or tabs (review)', () => {
  /** Two browsers of one user on one table: each has its own storage. */
  const twoDevices = () => {
    const db = fakeBackend();
    const mem = () => {
      const m = new Map<string, string>();
      return {
        getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); },
        removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, get length() { return m.size; },
      } as Storage;
    };
    const phone = createUserSettingsStore({ backend: () => db.backend, storage: mem, debounceMs: 10 });
    const laptopStorage = mem();
    const laptop = createUserSettingsStore({ backend: () => db.backend, storage: () => laptopStorage, debounceMs: 10 });
    return { db, phone, laptop, laptopStorage };
  };

  it('a stale copy writing net worth does not put an old payday back', async () => {
    const { db, phone, laptop } = twoDevices();
    db.rows.set(A, { monthly_income: 10000, payday_day: 30 });
    await laptop.start(A); // loaded earlier, never read again
    await phone.start(A);
    phone.set('payday_day', 28);
    await phone.flush();
    expect(db.rows.get(A)!.payday_day).toBe(28);

    laptop.set('net_worth_history', { '2026-11': 5000 });
    await laptop.flush();
    expect(db.rows.get(A)).toEqual({ monthly_income: 10000, payday_day: 28, net_worth_history: { '2026-11': 5000 } });
    // and the laptop now shows the phone's payday
    expect(laptop.get('payday_day')).toBe(28);
  });

  it('a tab that loaded an empty row does not wipe what another tab adopted', async () => {
    fillLegacy();
    const db = fakeBackend();
    const tab2 = createUserSettingsStore({ backend: () => db.backend, storage: () => localStorage, debounceMs: 10 });
    const tab1 = createUserSettingsStore({ backend: () => db.backend, storage: () => localStorage, debounceMs: 10 });
    // tab 2 reads the empty row before tab 1 adopts the old values
    const slow = db.backend.load;
    let release!: () => void;
    db.backend.load = userId => new Promise(res => { release = () => res(slow(userId)); });
    const loading2 = tab2.start(A);
    db.backend.load = slow;
    await tab1.start(A);
    expect(db.rows.get(A)).toMatchObject({ monthly_income: 10000, payday_day: 30 });
    // what tab 2's load answers with was read before tab 1 wrote
    db.backend.load = async () => ({ data: null, error: null, status: 200 });
    release();
    await loading2;
    db.backend.load = slow;
    tab2.set('net_worth_history', { '2026-11': 1 });
    await tab2.flush();
    expect(db.rows.get(A)).toMatchObject({ monthly_income: 10000, payday_day: 30, net_worth_history: { '2026-11': 1 } });
  });

  it('refresh reads the row again, so a resumed phone shows the laptop\'s change', async () => {
    const { db, phone, laptop } = twoDevices();
    db.rows.set(A, { payday_day: 30 });
    await phone.start(A);
    await laptop.start(A);
    laptop.set('payday_day', 25);
    await laptop.flush();
    expect(phone.get('payday_day')).toBe(30);
    await phone.refresh();
    expect(phone.get('payday_day')).toBe(25);
  });

  it('a failed first load does not replace the saved history with one month', async () => {
    const { db, laptop } = twoDevices();
    db.rows.set(A, { monthly_income: 10000, net_worth_history: { '2026-09': 5, '2026-10': 6 } });
    db.state.down = true;
    await laptop.start(A);
    expect(laptop.getSnapshot()).toMatchObject({ ready: true, mode: 'local', data: {} });
    laptop.set('net_worth_history', { '2026-11': 7 });
    db.state.down = false;
    await laptop.flush();
    expect(db.rows.get(A)).toEqual({ monthly_income: 10000, net_worth_history: { '2026-09': 5, '2026-10': 6, '2026-11': 7 } });
    expect(laptop.get('net_worth_history')).toEqual({ '2026-09': 5, '2026-10': 6, '2026-11': 7 });
  });

  it('clearing the history still clears it on the server', async () => {
    const { db, laptop } = twoDevices();
    db.rows.set(A, { net_worth_history: { '2026-09': 5 } });
    await laptop.start(A);
    laptop.set('net_worth_history', undefined);
    await laptop.flush();
    expect(db.rows.get(A)).toEqual({});
  });
});

describe('writes', () => {
  it('a slider sends one request, not one per step', async () => {
    vi.useFakeTimers();
    const { db, store } = setup();
    await store.start(A);
    for (let v = 1000; v <= 20000; v += 100) store.set('monthly_income', v);
    expect(store.get('monthly_income')).toBe(20000);
    expect(db.state.saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(db.state.saves).toHaveLength(1);
    expect(db.rows.get(A)).toEqual({ monthly_income: 20000 });
  });

  it('a failed write keeps the value on screen and goes out with the next change', async () => {
    const { db, store } = setup();
    await store.start(A);
    db.state.down = true;
    store.set('monthly_income', 9000);
    await expect(store.flush()).resolves.toBe(false);
    expect(store.get('monthly_income')).toBe(9000);

    db.state.down = false;
    store.set('payday_day', 25);
    await store.flush();
    expect(db.rows.get(A)).toEqual({ monthly_income: 9000, payday_day: 25 });
  });

  it('every reader hears a change', async () => {
    const { store } = setup();
    await store.start(A);
    const heard = vi.fn();
    store.subscribe(heard);
    store.set('secondary_currency', 'EUR');
    expect(heard).toHaveBeenCalled();
    expect(store.getSnapshot().data.secondary_currency).toBe('EUR');
  });

  it('discard drops a waiting change, so it cannot put back a deleted row', async () => {
    vi.useFakeTimers();
    const { db, store } = setup();
    await store.start(A);
    store.set('monthly_income', 9000);
    await store.discard();
    await vi.advanceTimersByTimeAsync(2000);
    expect(db.state.saves).toHaveLength(0);
    expect(localStorage.getItem(userKey(A, 'settings'))).toBeNull();
    store.set('monthly_income', 1);
    expect(store.get('monthly_income')).toBeUndefined();
  });
});

describe('sanitizeSettings', () => {
  it('caps the net worth history at the newest months', () => {
    const history: Record<string, number> = {};
    for (let i = 0; i < 60; i++) history[`${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`] = i;
    const out = sanitizeSettings({ net_worth_history: history }).net_worth_history!;
    expect(Object.keys(out)).toHaveLength(NET_WORTH_MONTHS);
    expect(Object.keys(out)[0]).toBe('2023-01');
    expect(Object.keys(out).at(-1)).toBe('2024-12');
  });

  it('keeps at most the 12 newest templates and drops broken ones', () => {
    const t = (n: number) => ({ name: `T${n}`, savedAt: '', items: [{ category: 'Food', categoryIcon: '', amount: n, period: 'monthly' }] });
    const out = sanitizeSettings({ budget_templates: [{ name: 5 }, ...Array.from({ length: 20 }, (_, i) => t(i))] });
    expect(out.budget_templates).toHaveLength(MAX_TEMPLATES);
    expect(out.budget_templates![0].name).toBe('T0');
  });

  it('drops values the app cannot use and keeps keys a newer version wrote', () => {
    expect(sanitizeSettings({
      monthly_income: -5, payday_day: 32, secondary_currency: 'usd', net_worth_goal: 'x', future_key: { a: 1 },
    })).toEqual({ future_key: { a: 1 } });
  });

  it('keeps the first-use flags only when they are true', () => {
    expect(sanitizeSettings({ currency_confirmed: true, checklist_dismissed: true }))
      .toEqual({ currency_confirmed: true, checklist_dismissed: true });
    expect(sanitizeSettings({ currency_confirmed: '1', checklist_dismissed: false })).toEqual({});
  });
});

describe('readLegacySettings', () => {
  it('reads the old keys and ignores what cannot be read', () => {
    localStorage.setItem(LEGACY_KEYS.monthly_income, '12500.5');
    localStorage.setItem(LEGACY_KEYS.payday_day, '0');
    localStorage.setItem(LEGACY_KEYS.budget_templates, '{not json');
    expect(readLegacySettings(localStorage)).toEqual({ monthly_income: 12500.5 });
  });
});

describe('convertSettingsAmounts', () => {
  it('converts every money amount and nothing else', () => {
    const s: UserSettings = {
      monthly_income: 10000, net_worth_goal: 50000, payday_day: 30,
      net_worth_history: { '2026-10': 1000 },
      budget_templates: [{ name: 'T', savedAt: '', items: [{ category: 'Food', categoryIcon: '', amount: 1200, period: 'monthly' }] }],
    };
    const out = convertSettingsAmounts(s, 0.2723);
    expect(out).toEqual({
      monthly_income: 2723, net_worth_goal: 13615,
      net_worth_history: { '2026-10': 272.3 },
      budget_templates: [{ name: 'T', savedAt: '', items: [{ category: 'Food', categoryIcon: '', amount: 326.76, period: 'monthly' }] }],
    });
  });

  it('changes nothing at a rate of 1', () => {
    expect(convertSettingsAmounts({ monthly_income: 10000 }, 1)).toEqual({});
  });
});

describe('mergeUnsaved', () => {
  it('lets a change made here win, including a cleared value', () => {
    expect(mergeUnsaved({ monthly_income: 1, payday_day: 2 }, { payday_day: 9 }, ['payday_day', 'monthly_income']))
      .toEqual({ payday_day: 9 });
  });

  it('merges net worth history by month', () => {
    const server = { net_worth_history: { '2026-09': 1, '2026-10': 2 } };
    const local = { net_worth_history: { '2026-10': 20, '2026-11': 30 } };
    expect(mergeUnsaved(server, local, ['net_worth_history'], { months: ['2026-11'], cleared: false }))
      .toEqual({ net_worth_history: { '2026-09': 1, '2026-10': 2, '2026-11': 30 } });
    expect(mergeUnsaved(server, local, ['net_worth_history'], { months: ['2026-11'], cleared: true }))
      .toEqual({ net_worth_history: { '2026-11': 30 } });
  });
});

describe('isMissingTable', () => {
  it('knows the answers PostgREST and Postgres give for a table that does not exist', () => {
    expect(isMissingTable(MISSING)).toBe(true);
    expect(isMissingTable({ error: { message: 'x', code: '42P01' } })).toBe(true);
    expect(isMissingTable({ error: { message: 'Failed to fetch' } })).toBe(false);
    expect(isMissingTable({ error: null, status: 404 })).toBe(false);
  });
});

describe('supabaseSettingsBackend', () => {
  it('sends only the changed keys, to the merge function', async () => {
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    await supabaseSettingsBackend({ rpc } as never).save(A, { payday_day: 28 }, ['monthly_income']);
    expect(rpc).toHaveBeenCalledWith('merge_user_settings', { patch: { payday_day: 28 }, removed: ['monthly_income'] });
  });
});
