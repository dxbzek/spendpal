// Warning text ("Statement due ... has passed", a card's utilisation) was the
// fill amber on white: 2.1:1. Small text needs 4.5:1.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { contrastRatio, hslTokenToRgb, mixRgb } from '@/lib/contrast';

const root = resolve(__dirname, '../..');
const css = readFileSync(join(root, 'src/index.css'), 'utf8');
const tailwind = readFileSync(join(root, 'tailwind.config.ts'), 'utf8');

/** A token's value in the light (:root) or dark (.dark) block. */
function token(block: 'light' | 'dark', name: string): string {
  const start = css.indexOf(block === 'light' ? ':root {' : '.dark {');
  const end = css.indexOf('\n  }', start);
  const m = css.slice(start, end).match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} not in the ${block} block`);
  return m[1];
}

/** The token text-warning resolves to. */
function warningTextToken(): string {
  const m = tailwind.match(/textColor:\s*{\s*warning:\s*{\s*DEFAULT:\s*"hsl\(var\(--([\w-]+)\)\)"/);
  return m ? m[1] : 'warning';
}

describe('warning text contrast', () => {
  for (const block of ['light', 'dark'] as const) {
    it(`text-warning is at least 4.5:1 on cards, soft warning tints and muted in ${block} mode`, () => {
      const text = hslTokenToRgb(token(block, warningTextToken()));
      const card = hslTokenToRgb(token(block, 'card'));
      const fill = hslTokenToRgb(token(block, 'warning'));
      const muted = hslTokenToRgb(token(block, 'muted'));
      expect(contrastRatio(text, card)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(text, mixRgb(fill, card, 0.12))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(text, muted)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('bars and badges keep the fill amber', () => {
    expect(token('light', 'warning')).toBe('38 92% 50%');
    expect(tailwind).toContain('DEFAULT: "hsl(var(--warning))"');
  });

  it('measures the known pair: amber 500 on white is about 2.1:1', () => {
    expect(contrastRatio(hslTokenToRgb('38 92% 50%'), hslTokenToRgb('0 0% 100%'))).toBeCloseTo(2.14, 1);
  });
});
