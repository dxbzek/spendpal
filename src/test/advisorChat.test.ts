// The AI Advisor chat helpers: what reaches the model and how memory changes.
import { describe, it, expect } from 'vitest';
import { applyMemory, parseTurns, readMemoryTags } from '../../supabase/functions/ai-finance/chat';

describe('advisor chat', () => {
  it('keeps only valid turns and needs the last one from the user', () => {
    expect(parseTurns({ messages: [{ role: 'user', content: 'hi' }] })).toEqual([{ role: 'user', content: 'hi' }]);
    expect(parseTurns({ messages: [{ role: 'assistant', content: 'x' }, { role: 'user', content: 'q' }] })).toEqual([{ role: 'user', content: 'q' }]);
    expect(parseTurns({ messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }] })).toBeNull();
    expect(parseTurns({ messages: [{ role: 'system', content: 'q' }] })).toBeNull();
    expect(parseTurns({})).toBeNull();
  });

  it('pulls memory tags out of the reply', () => {
    const r = readMemoryTags('You get paid on the 24th.\n<remember>Payday is the 24th</remember><forget>Payday is the 1st</forget>');
    expect(r.reply).toBe('You get paid on the 24th.');
    expect(r.remember).toEqual(['Payday is the 24th']);
    expect(r.forget).toEqual(['Payday is the 1st']);
  });

  it('adds new facts once and drops forgotten ones', () => {
    expect(applyMemory(['Payday is the 1st', 'Saves for a car'], ['payday is the 24th', 'Saves for a car'], ['payday is the 1st']))
      .toEqual(['Saves for a car', 'payday is the 24th']);
  });
});
