// At 1280 px, Home's four-column grid left holes: Installment Plans and
// Spending Forecast sat alone beside an empty half, and a widget that
// rendered nothing still took its half. The sections are flex rows now,
// where a lone half grows to the full row and an empty slot is removed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = readFileSync(join(resolve(__dirname, '../..'), 'src/pages/Dashboard.tsx'), 'utf8');

describe('Home layout', () => {
  it('has no fixed half-width grid slots left', () => {
    expect(src).not.toContain('col-span-2 lg:col-span-2');
  });

  it('lets a half card without a partner fill the row, and drops empty slots', () => {
    expect(src).toMatch(/const SECTION = 'flex flex-wrap /);
    expect(src).toMatch(/const HALF = '[^']*\bgrow\b[^']*lg:basis-\[calc\(50%-0\.625rem\)\]/);
    expect(src).toMatch(/const HALF_SLOT = `\$\{HALF\} empty:hidden/);
  });

  it('Income and Expenses fill the Overview row on wide screens', () => {
    expect(src.match(/col-span-1 lg:col-span-2 overflow-hidden/g)).toHaveLength(2);
  });

  it('keeps both category cards: Breakdown and By Category', () => {
    expect(src).toContain('>Breakdown</h2>');
    expect(src).toContain('>By Category</h2>');
  });
});
