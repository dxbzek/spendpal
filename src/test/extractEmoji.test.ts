import { describe, it, expect } from 'vitest';
import { extractEmoji } from '@/utils/categoryColors';

describe('extractEmoji', () => {
  it('keeps a flag whole (two regional-indicator letters)', () => {
    expect(extractEmoji('🇬🇪')).toBe('🇬🇪');
    expect(extractEmoji('🇦🇪 Travel')).toBe('🇦🇪');
  });

  it('keeps joined and skin-tone emoji whole', () => {
    expect(extractEmoji('👨‍👩‍👧')).toBe('👨‍👩‍👧');
    expect(extractEmoji('👍🏽')).toBe('👍🏽');
    expect(extractEmoji('🏳️‍🌈')).toBe('🏳️‍🌈');
  });

  it('still handles plain and variation-selector emoji', () => {
    expect(extractEmoji('☕')).toBe('☕');
    expect(extractEmoji('🍽️')).toBe('🍽️');
    expect(extractEmoji('Rent 🏠')).toBe('🏠');
  });

  it('falls back to the first character when there is no emoji', () => {
    expect(extractEmoji('Rent')).toBe('R');
  });
});
