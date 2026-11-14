// The narrow pages used max-w-2xl with px-4 while the rest of the app used
// px-5 md:px-8, so their content edge jumped when moving between pages.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NARROW_PAGE } from '@/lib/pageLayout';

const page = (name: string) => readFileSync(join(resolve(__dirname, '../..'), 'src/pages', `${name}.tsx`), 'utf8');

describe('narrow pages', () => {
  it('share one width and the app padding', () => {
    expect(NARROW_PAGE).toBe('max-w-2xl mx-auto px-5 md:px-8');
  });

  for (const name of ['Accounts', 'Installments', 'Reports', 'CalendarView', 'Settings', 'Glossary']) {
    it(`${name} uses it`, () => {
      const src = page(name);
      expect(src).toContain('${NARROW_PAGE}');
      expect(src).not.toMatch(/max-w-2xl mx-auto px-4/);
    });
  }
});
