// Tell the user when a new build is ready instead of silently serving the
// cached one. The service worker waits (registerType "prompt") until the
// toast is tapped, then takes over and the page reloads on the new build.
//
// An installed PWA can stay open for days without a navigation, which is the
// only time the browser checks for a new service worker on its own, so we
// also check hourly and whenever the app comes back to the foreground.
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import { recoverFromChunkError, setWaitingUpdate } from '@/lib/appReload';

const CHECK_EVERY_MS = 60 * 60 * 1000;

export function registerAppUpdates() {
  // Vite fires this when a lazy page's file can't be fetched.
  window.addEventListener('vite:preloadError', event => {
    if (recoverFromChunkError()) event.preventDefault();
  });

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setWaitingUpdate(() => { void updateSW(true); });
      toast('New version, tap to reload', {
        id: 'app-update',
        duration: Infinity,
        action: { label: 'Reload', onClick: () => { void updateSW(true); } },
      });
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => { if (navigator.onLine) void registration.update().catch(() => { /* offline or mid-deploy; try next time */ }); };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    },
  });
}
