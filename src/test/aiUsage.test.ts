// What the app shows and checks about the AI uses left today (src/lib/aiUsage.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { aiUsage, batchBlockedMessage, nextResetAt, readRemaining, usageLine } from '@/lib/aiUsage';

describe('readRemaining', () => {
  it('reads the number from a server answer', () => {
    expect(readRemaining({ result: '[]', remaining: 12 })).toBe(12);
    expect(readRemaining({ error: 'limit', remaining: 0 })).toBe(0);
  });

  it('is null when the answer has no usable number', () => {
    expect(readRemaining({ result: '[]' })).toBeNull();
    expect(readRemaining({ remaining: '12' })).toBeNull();
    expect(readRemaining({ remaining: -1 })).toBeNull();
    expect(readRemaining({ remaining: 1.5 })).toBeNull();
    expect(readRemaining(null)).toBeNull();
    expect(readRemaining('text')).toBeNull();
  });
});

describe('usageLine', () => {
  it('shows nothing until the number is known', () => {
    expect(usageLine(null, '04:00')).toBeNull();
  });

  it('shows the uses left', () => {
    expect(usageLine(12, '04:00')).toBe('12 AI uses left today.');
    expect(usageLine(1, '04:00')).toBe('1 AI use left today.');
  });

  it('says plainly when the limit is reached, and when it resets', () => {
    expect(usageLine(0, '04:00')).toBe('No AI uses left today. The count resets at 04:00.');
  });
});

describe('nextResetAt', () => {
  it('is the next 00:00 UTC', () => {
    expect(nextResetAt(new Date('2026-11-14T10:30:00Z')).toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(nextResetAt(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('batchBlockedMessage', () => {
  it('lets an import start when the uses left cover every chunk', () => {
    expect(batchBlockedMessage(5, 5)).toBeNull();
    expect(batchBlockedMessage(2, 30)).toBeNull();
  });

  it('lets an import start when the number is not known', () => {
    expect(batchBlockedMessage(5, null)).toBeNull();
  });

  it('stops an import that would run out part way and lose its rows', () => {
    expect(batchBlockedMessage(6, 5)).toBe(
      'This statement needs 6 AI uses and you have 5 left today. Import a shorter file, or try again tomorrow.',
    );
    expect(batchBlockedMessage(2, 0)).toBe('No AI uses left today. Import this statement tomorrow.');
  });
});

describe('aiUsage store', () => {
  const now = new Date('2026-11-14T10:00:00Z');
  beforeEach(() => aiUsage.reset());

  it('is unknown at the start', () => {
    expect(aiUsage.get('u1', now)).toBeNull();
  });

  it('remembers the number a server answer carried', () => {
    aiUsage.note('u1', { result: 'ok', remaining: 7 }, now);
    expect(aiUsage.get('u1', now)).toBe(7);
  });

  it('ignores an answer without a number', () => {
    aiUsage.set('u1', 7, now);
    aiUsage.note('u1', { result: 'ok' }, now);
    expect(aiUsage.get('u1', now)).toBe(7);
  });

  it("does not show one user's number to the next user on the same device", () => {
    aiUsage.set('u1', 0, now);
    expect(aiUsage.get('u2', now)).toBeNull();
    expect(aiUsage.get(null, now)).toBeNull();
  });

  it("does not carry yesterday's number into today", () => {
    aiUsage.set('u1', 0, now);
    expect(aiUsage.get('u1', new Date('2026-11-15T00:00:01Z'))).toBeNull();
  });

  it('tells subscribers when the number changes', () => {
    let calls = 0;
    const off = aiUsage.subscribe(() => { calls++; });
    aiUsage.set('u1', 3, now);
    off();
    aiUsage.set('u1', 2, now);
    expect(calls).toBe(1);
  });
});
