import * as Sentry from '@sentry/react';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import "./index.css";
import { registerAppUpdates } from "./lib/pwaUpdate";
import { polyfillCountryFlagEmojis } from "country-flag-emoji-polyfill";

// Show a "New version, tap to reload" toast when a new build is deployed.
registerAppUpdates();

// Windows has no flag glyphs ("🇬🇪" shows as "GE"). Where flags don't draw,
// load a flag-only font from our own origin (the CSP blocks font CDNs).
polyfillCountryFlagEmojis("Twemoji Country Flags", "/fonts/TwemojiCountryFlags.woff2");

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD && !!import.meta.env.VITE_SENTRY_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
  // Strip financial PII from error traces - amounts, merchants, and
  // category names must not appear in Sentry breadcrumbs or extra context.
  beforeSend(event) {
    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        const val = event.extra[key];
        if (typeof val === 'number') { event.extra[key] = '[number]'; }
        else if (typeof val === 'string' && /\d/.test(val)) { event.extra[key] = '[redacted]'; }
      }
    }
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(b => ({
        ...b,
        message: b.message?.replace(/\d[\d,. ]*/g, '[amount]'),
        data: b.data ? Object.fromEntries(
          Object.entries(b.data).map(([k, v]) => [k, typeof v === 'number' ? '[amount]' : v])
        ) : b.data,
      }));
    }
    return event;
  },
});

document.getElementById('app-shell-loader')?.remove();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
