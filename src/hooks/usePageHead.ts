import { useEffect } from 'react';
import { canonicalUrl, publicPage, type PublicPage } from '@/lib/publicSite';

const META_KEYS: [selector: string, field: 'title' | 'description' | 'url'][] = [
  ['meta[name="description"]', 'description'],
  ['meta[property="og:description"]', 'description'],
  ['meta[name="twitter:description"]', 'description'],
  ['meta[property="og:title"]', 'title'],
  ['meta[name="twitter:title"]', 'title'],
  ['meta[property="og:url"]', 'url'],
];

function applyHead(page: PublicPage) {
  const values = { title: page.title, description: page.description, url: canonicalUrl(page.path) };
  document.title = page.title;
  for (const [selector, field] of META_KEYS) {
    const el = document.head.querySelector<HTMLMetaElement>(selector);
    if (el) el.content = values[field];
  }
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical) canonical.href = values.url;
}

/**
 * Give a public page its own title, description and canonical while it shows.
 * The build already writes them into each page's HTML file; this keeps them
 * right when someone moves between pages inside the app. On leaving, the head
 * goes back to the home page's, which is what index.html carries: the page
 * the app was opened on (say privacy.html) must not name the app's screens.
 */
export function usePageHead(path: string) {
  useEffect(() => {
    const page = publicPage(path);
    const home = publicPage('/');
    if (!page || !home) return;
    applyHead(page);
    return () => applyHead(home);
  }, [path]);
}
