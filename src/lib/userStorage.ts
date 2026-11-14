// Browser storage that belongs to one signed-in user.
//
// The app used to keep values under fixed names ("balanceHidden",
// "spendpal_monthly_income"), so the next account to sign in on the same
// browser read the last one's. Every per-user key now carries the user id:
// spendpal_u.<user id>.<name>. A second account never reads the first one's.

const USER_PREFIX = 'spendpal_u.';

export const userKey = (userId: string, name: string) => `${USER_PREFIX}${userId}.${name}`;

/** The user id a key belongs to, or null for a key that is not per user. */
export function keyOwner(key: string): string | null {
  if (!key.startsWith(USER_PREFIX)) return null;
  const rest = key.slice(USER_PREFIX.length);
  const dot = rest.indexOf('.');
  return dot > 0 ? rest.slice(0, dot) : null;
}

// Storage can be missing or throw (private mode, blocked site data). Every
// read and write goes through these so a blocked browser only loses the copy.
export function safeGet(storage: Storage | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}
export function safeSet(storage: Storage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try { storage.setItem(key, value); return true; } catch { return false; }
}
export function safeRemove(storage: Storage | null, key: string): void {
  try { storage?.removeItem(key); } catch { /* nothing kept there either */ }
}

/** localStorage, or null when the browser refuses it. */
export function browserStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/**
 * A per-device choice for one user, such as "hide balances". The value kept
 * under the old fixed name is moved to the first user who reads it, so the
 * person who set it keeps it after this change; after that the old name is gone.
 */
export function readUserItem(storage: Storage | null, userId: string, name: string, legacyKey?: string): string | null {
  const key = userKey(userId, name);
  const own = safeGet(storage, key);
  if (own !== null || !legacyKey) return own;
  const legacy = safeGet(storage, legacyKey);
  if (legacy === null) return null;
  if (safeSet(storage, key, legacy)) safeRemove(storage, legacyKey);
  return legacy;
}

export function writeUserItem(storage: Storage | null, userId: string, name: string, value: string): void {
  safeSet(storage, userKey(userId, name), value);
}
