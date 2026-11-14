// The public side of the site: every address the app answers is either a
// public page or a known app route, Vercel serves exactly those and sends a
// 404 for the rest, and the sitemap, robots.txt and each page's head agree.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  APP_ROUTES, PUBLIC_PAGES, NOT_FOUND_TITLE, SITE_URL,
  canonicalUrl, publicPage, withNotFoundHead, withPageHead,
} from '@/lib/publicSite';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

const appRoutes = () => [...read('src/App.tsx').matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1]);
const vercel = () => JSON.parse(read('vercel.json')) as { rewrites: { source: string; destination: string }[] };

/** Where Vercel sends a path, from the rewrites alone (null: no rule, so the 404 file). */
function vercelDestination(path: string): string | null {
  for (const r of vercel().rewrites) {
    // Vercel's ":name(a|b)" is a capture with that pattern; "(.*)" is anything.
    const pattern = r.source.replace(/:\w+\(/g, '(');
    if (new RegExp(`^${pattern}$`).test(path)) return r.destination;
  }
  return null;
}

describe('routes', () => {
  it('every route in App.tsx is a public page or a listed app route', () => {
    const known = new Set([...PUBLIC_PAGES.map(p => p.path), ...APP_ROUTES, '*']);
    expect(appRoutes().filter(r => !known.has(r))).toEqual([]);
  });

  it('every listed page and app route exists in App.tsx', () => {
    const routes = new Set(appRoutes());
    expect([...PUBLIC_PAGES.map(p => p.path), ...APP_ROUTES].filter(r => !routes.has(r))).toEqual([]);
  });
});

describe('vercel.json', () => {
  it('serves each public page from its own file', () => {
    for (const page of PUBLIC_PAGES) {
      if (page.path === '/') continue; // index.html is served for "/" without a rule
      expect(vercelDestination(page.path)).toBe(`/${page.file}`);
    }
  });

  it('serves the app for every app route', () => {
    for (const route of APP_ROUTES) expect(vercelDestination(route)).toBe('/index.html');
  });

  it('has no rule for an unknown address, so Vercel answers 404', () => {
    expect(vercelDestination('/does-not-exist-xyz')).toBeNull();
    expect(vercelDestination('/.well-known/security.txt')).toBeNull();
    expect(vercelDestination('/settingsx')).toBeNull();
    expect(vercelDestination('/settings/extra')).toBeNull();
  });
});

describe('sitemap and robots', () => {
  it('the sitemap lists exactly the public pages', () => {
    const locs = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(locs).toEqual(PUBLIC_PAGES.map(p => canonicalUrl(p.path)));
  });

  it('robots.txt keeps every app route out and no public page', () => {
    const robots = read('public/robots.txt');
    // One group for every crawler: a named group would make that crawler skip these rules.
    expect([...robots.matchAll(/^User-agent:\s*(.+)$/gm)].map(m => m[1].trim())).toEqual(['*']);
    const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map(m => m[1]);
    expect([...disallowed].sort()).toEqual([...APP_ROUTES].sort());
    for (const page of PUBLIC_PAGES) {
      expect(disallowed.some(d => page.path.startsWith(d))).toBe(false);
    }
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });
});

describe('page heads', () => {
  const index = read('index.html');

  it('index.html describes the home page and makes no price claim', () => {
    const home = publicPage('/')!;
    expect(index).toContain(`<title>${home.title}</title>`);
    expect(index).toContain(`<meta name="description" content="${home.description}" />`);
    expect(index).not.toMatch(/"price"/);
  });

  it('gives each public page its own title, description, canonical and sharing tags', () => {
    for (const page of PUBLIC_PAGES) {
      const html = withPageHead(index, page);
      expect(html).toContain(`<title>${page.title}</title>`);
      expect(html).toContain(`<link rel="canonical" href="${canonicalUrl(page.path)}" />`);
      expect(html).toContain(`<meta property="og:url" content="${canonicalUrl(page.path)}" />`);
      expect(html.match(new RegExp(`content="${page.description}"`, 'g'))).toHaveLength(3);
      expect(html.match(new RegExp(`content="${page.title.replace('|', '\\|')}"`, 'g'))).toHaveLength(2);
    }
    // The privacy page no longer says it is the home page.
    expect(withPageHead(index, publicPage('/privacy')!)).not.toContain(`<link rel="canonical" href="${SITE_URL}/" />`);
  });

  it('the 404 file has no canonical and asks not to be indexed', () => {
    const html = withNotFoundHead(index);
    expect(html).toContain(`<title>${NOT_FOUND_TITLE}</title>`);
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('rel="canonical"');
    // Still the app: the script that starts it is there.
    expect(html).toContain('src="/src/main.tsx"');
  });

  it('publicPage ignores a trailing slash and knows no app route', () => {
    expect(publicPage('/privacy/')?.path).toBe('/privacy');
    expect(publicPage('/settings')).toBeNull();
  });
});
