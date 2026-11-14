// The install manifest is built from vite.config.ts. Read as text: importing
// the config would start the PWA plugin.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');

describe('web app manifest', () => {
  it('has a fixed id and store categories', () => {
    expect(config).toMatch(/\bid: "\/",/);
    expect(config).toContain('categories: ["finance", "productivity"]');
  });

  it('does not lock an installed window to portrait: the app has a desktop layout', () => {
    expect(config).not.toContain('orientation: "portrait"');
    expect(config).toContain('orientation: "any"');
  });

  it('lists only icon and screenshot files that exist in public/', () => {
    const srcs = [...config.matchAll(/src: "([^"]+)"/g)].map(m => m[1]);
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) expect(existsSync(join(root, 'public', src)), src).toBe(true);
  });
});
