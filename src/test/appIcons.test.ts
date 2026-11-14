import { describe, it, expect } from 'vitest';
import { Tag } from 'lucide-react';
import { iconFor, PICKER_ICONS } from '@/lib/appIcons';

describe('iconFor', () => {
  it('draws the emoji that rows written outside the app carry', () => {
    // The command-line importer's icon per category (api/spendpal.py CATEGORY_ICONS).
    const written = ['🍔', '🍿', '🚕', '👪', '📺', '🎟️', '🙏', '🏛️', '↩️', '↔️', '❓', '🛒', '💊', '🏠', '💰', '🔁', '🍽️', '🛍️', '💻', '📱', '✈️', '💍', '🎮', '⛽', '🚇', '🧾', '💸', '🏋️'];
    expect(written.filter(e => iconFor(e) === Tag)).toEqual([]);
  });

  it('gives different categories different icons', () => {
    const icons = ['🍔', '🚕', '👪', '📺', '🎟️'].map(iconFor);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('falls back to a tag for an unknown or empty value, and keeps the picker list unchanged', () => {
    expect(iconFor('🦄')).toBe(Tag);
    expect(iconFor(null)).toBe(Tag);
    expect(PICKER_ICONS).not.toContain('🍔');
  });
});
