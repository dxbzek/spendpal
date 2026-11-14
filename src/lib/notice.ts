// A message for the next page load in this tab. Delete Everything reloads
// the app right after it finishes, and a toast shown before the reload is
// gone before anyone can read it.
const KEY = 'spendpal_notice';

export function leaveNotice(text: string, storage: Storage | null = sessionStorageOrNull()): void {
  try { storage?.setItem(KEY, text); } catch { /* private mode: the message is lost, nothing else */ }
}

/** The waiting message, once. */
export function takeNotice(storage: Storage | null = sessionStorageOrNull()): string | null {
  try {
    const text = storage?.getItem(KEY) ?? null;
    storage?.removeItem(KEY);
    return text;
  } catch { return null; }
}

function sessionStorageOrNull(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}
