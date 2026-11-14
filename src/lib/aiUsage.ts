// How many AI uses the signed-in user has left today.
//
// The server counts the calls (edge function ai-finance, 30 per user per UTC
// day) and sends the number left in the "remaining" field of its answers. This
// file only remembers the last number it was told, so the AI Advisor page can
// show it and a statement import can check it before it starts.

import { onSignOut } from '@/lib/signOutReset';

/** The number in a server answer, or null when the answer does not carry one. */
export function readRemaining(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const n = (payload as { remaining?: unknown }).remaining;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null;
}

/** The server's usage day: the UTC date. */
export function usageDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** When the count goes back to full: the next 00:00 UTC. */
export function nextResetAt(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/**
 * The line under the AI buttons. `resetTime` is the reset in the user's own
 * clock, e.g. "04:00". Null when the number is not known: show nothing then.
 */
export function usageLine(remaining: number | null, resetTime: string): string | null {
  if (remaining === null) return null;
  if (remaining === 0) return `No AI uses left today. The count resets at ${resetTime}.`;
  return `${remaining} AI ${remaining === 1 ? 'use' : 'uses'} left today.`;
}

/**
 * A statement import makes one call per chunk and keeps nothing if a later
 * chunk is refused. So refuse before the first call when the uses left cannot
 * cover every chunk. Null means the import may start.
 */
export function batchBlockedMessage(chunks: number, remaining: number | null): string | null {
  if (remaining === null || chunks <= remaining) return null;
  if (remaining === 0) return 'No AI uses left today. Import this statement tomorrow.';
  return `This statement needs ${chunks} AI uses and you have ${remaining} left today. Import a shorter file, or try again tomorrow.`;
}

interface Known { userId: string; day: string; remaining: number }

let known: Known | null = null;
const listeners = new Set<() => void>();

export const aiUsage = {
  /**
   * The number left for this user today, or null when it is not known. A
   * number from another user or from a day that is over is not used.
   */
  get(userId: string | null | undefined, now: Date = new Date()): number | null {
    if (!known || !userId || known.userId !== userId || known.day !== usageDay(now)) return null;
    return known.remaining;
  },
  set(userId: string, remaining: number, now: Date = new Date()): void {
    known = { userId, day: usageDay(now), remaining };
    listeners.forEach(l => l());
  },
  /** Store the number from a server answer, if it has one. */
  note(userId: string | null | undefined, payload: unknown, now: Date = new Date()): void {
    const n = readRemaining(payload);
    if (userId && n !== null) aiUsage.set(userId, n, now);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** For tests. */
  reset(): void {
    known = null;
  },
};
onSignOut(() => aiUsage.reset());
