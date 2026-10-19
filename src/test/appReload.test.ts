import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isChunkLoadError, recoverFromChunkError, setWaitingUpdate } from '@/lib/appReload';

describe('stale chunk recovery', () => {
  beforeEach(() => sessionStorage.clear());

  it('recognises a missing chunk from an older deploy', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: https://spendpal.vercel.app/assets/Goals-DokOktd0.js')).toBe(true);
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true); // Safari
    expect(isChunkLoadError("Cannot read properties of undefined (reading 'map')")).toBe(false);
  });

  it('takes the waiting update once, then stops instead of looping', () => {
    const apply = vi.fn();
    setWaitingUpdate(apply);
    expect(recoverFromChunkError()).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    // Still failing right after: show the error screen, don't reload again.
    expect(recoverFromChunkError()).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
