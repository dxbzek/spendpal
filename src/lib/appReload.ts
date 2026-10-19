// Getting a stale page onto the live build. Kept apart from pwaUpdate (which
// imports the service-worker virtual module) so the error boundary can use it.

// Set by pwaUpdate when a new service worker is installed and waiting.
let applyWaitingUpdate: (() => void) | null = null;
export const setWaitingUpdate = (apply: () => void) => { applyWaitingUpdate = apply; };

/**
 * Get onto the build that's live now: take the waiting service worker if
 * there is one (it reloads the page itself), otherwise just reload.
 */
export function reloadToLatest() {
  if (applyWaitingUpdate) applyWaitingUpdate();
  else window.location.reload();
}

// A page left open across a deploy asks for chunk files that the new deploy
// renamed ("Failed to fetch dynamically imported module …/Goals-<hash>.js").
const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i;
export const isChunkLoadError = (message: string) => CHUNK_ERROR.test(message);

const RELOAD_KEY = 'spendpal_chunk_reload_at';
/**
 * Reload onto the latest build after a missing chunk, at most once a minute so
 * a chunk that's missing on the server too can't loop. Returns false when it
 * already tried and the caller should show its error instead.
 */
export function recoverFromChunkError(): boolean {
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { /* private mode */ }
  if (Date.now() - last < 60_000) return false;
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* private mode */ }
  reloadToLatest();
  return true;
}
