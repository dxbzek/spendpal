// Which web pages may call the edge functions from a browser.
// This file has no Deno or npm imports, so the app's unit tests can load it.

export const APP_ORIGIN = "https://spendpal.vercel.app";

// The dev server (vite, port 8080) and any other local port.
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

/**
 * The origin to answer with. An origin that is not on the list gets the app's
 * own origin back, so the browser blocks the response for that page.
 * `extra` is the ALLOWED_ORIGINS secret: more origins, separated by commas,
 * for a custom domain or a preview build.
 */
export function pickOrigin(origin: string | null, extra?: string): string {
  if (!origin) return APP_ORIGIN;
  if (origin === APP_ORIGIN || LOCAL_ORIGIN.test(origin)) return origin;
  const more = (extra ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return more.includes(origin) ? origin : APP_ORIGIN;
}

export function corsHeadersFor(origin: string | null, extra?: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": pickOrigin(origin, extra),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    // The answer depends on who asked, so a cache must not reuse it.
    "Vary": "Origin",
  };
}
