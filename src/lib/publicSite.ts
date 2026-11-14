// The public side of the site: which addresses search engines may list, what
// each one is called, and which addresses belong to the signed-in app.
//
// vite.config.ts imports this file to write one HTML file per public page, so
// it must not use the "@/" alias or anything from the browser.

export const SITE_URL = 'https://spendpal.vercel.app';

export interface PublicPage {
  path: string;
  /** The file Vercel serves for this address. "/" is the app's own index.html. */
  file: string;
  title: string;
  description: string;
}

/** The pages a visitor can open without an account, in sitemap order. */
export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: '/',
    file: 'index.html',
    title: 'SpendPal | Personal finance tracker',
    description:
      'Track your accounts, cards, budgets, instalment plans and savings goals in one place. You type in or import your own records. There is no bank connection.',
  },
  {
    path: '/privacy',
    file: 'privacy.html',
    title: 'Privacy policy | SpendPal',
    description: 'What SpendPal stores, where it is processed, what is never done with it, and how to export or delete it.',
  },
  {
    path: '/terms',
    file: 'terms.html',
    title: 'Terms of use | SpendPal',
    description: 'The terms for using SpendPal: what the service is, what it is not, and acceptable use.',
  },
  {
    path: '/auth',
    file: 'auth.html',
    title: 'Sign in | SpendPal',
    description: 'Sign in to SpendPal or create an account.',
  },
];

/**
 * Addresses the single-page app answers that are not public pages: the
 * signed-in app, and the password reset form an email link opens. Vercel
 * serves index.html for these; every other unknown address gets the 404 file.
 * Keep in step with the routes in src/App.tsx (a test checks it).
 */
export const APP_ROUTES: readonly string[] = [
  '/reset',
  '/transactions',
  '/budgets',
  '/goals',
  '/accounts',
  '/reports',
  '/debt',
  '/installments',
  '/calendar',
  '/advisor',
  '/settings',
  '/glossary',
];

/** When the Privacy and Terms pages last changed. Update it with every change to either. */
export const LEGAL_LAST_CHANGED = '14 November 2026';

export const NOT_FOUND_TITLE = 'Page not found | SpendPal';

export const canonicalUrl = (path: string) => `${SITE_URL}${path === '/' ? '/' : path}`;

/** The public page for an address, or null for an app route or unknown address. */
export function publicPage(path: string): PublicPage | null {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return PUBLIC_PAGES.find(p => p.path === clean) ?? null;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Set the content of every <meta> whose name or property is one of `keys`. */
function setMeta(html: string, keys: string[], value: string): string {
  let out = html;
  for (const key of keys) {
    const tag = new RegExp(`(<meta\\s+(?:name|property)="${key}"\\s+content=")[^"]*(")`, 'g');
    out = out.replace(tag, `$1${escapeAttr(value)}$2`);
  }
  return out;
}

/**
 * index.html with the head of one public page: title, description, canonical
 * and the sharing tags. A crawler that does not run JavaScript, and every
 * link preview, reads these, so /privacy must not claim to be the home page.
 */
export function withPageHead(html: string, page: PublicPage): string {
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeText(page.title)}</title>`);
  out = setMeta(out, ['description', 'og:description', 'twitter:description'], page.description);
  out = setMeta(out, ['og:title', 'twitter:title'], page.title);
  out = setMeta(out, ['og:url'], canonicalUrl(page.path));
  out = out.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${canonicalUrl(page.path)}$2`);
  return out;
}

/**
 * index.html as the 404 file. The app still starts and shows its own "Page not
 * found", but the HTTP status is 404, there is no canonical, and search
 * engines are asked not to index it.
 */
export function withNotFoundHead(html: string): string {
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${NOT_FOUND_TITLE}</title>\n    <meta name="robots" content="noindex" />`)
    .replace(/\s*<link\s+rel="canonical"[^>]*>/, '');
}
