// Copies of one user's data kept in module memory (the category list, the AI
// count) outlive the pages that show them. Each registers here, and the auth
// context clears them all when the user signs out or another user signs in,
// so the next account on this browser never sees the last one's.

const resets = new Set<() => void>();

export function onSignOut(reset: () => void): () => void {
  resets.add(reset);
  return () => { resets.delete(reset); };
}

export function runSignOutResets(): void {
  for (const reset of resets) {
    try { reset(); } catch { /* one failed reset must not keep the others' data */ }
  }
}
