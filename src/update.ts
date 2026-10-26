// Keeps the installed app up to date. A Home Screen app on iPhone is usually resumed
// rather than reloaded, so checking only at start-up can leave it on an old version for
// days. This also checks every time the app comes back to the front, when the internet
// returns, and hourly. A newer version installs itself and the app reloads into it;
// everything you've logged is in the database, so nothing is lost.

import { registerSW } from 'virtual:pwa-register';

export const APP_VERSION = __APP_VERSION__;
export const APP_COMMIT = __APP_COMMIT__;
export const BUILT_AT = __BUILT_AT__;

const CHECK_EVERY_MS = 60 * 60 * 1000;

let registration: ServiceWorkerRegistration | undefined;

export function startUpdates() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (!reg) return;
      const check = () => { if (navigator.onLine) reg.update().catch(() => { /* try again next time */ }); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.addEventListener('online', check);
      setInterval(check, CHECK_EVERY_MS);
    },
  });
}

export type UpdateResult = 'latest' | 'updating' | 'offline' | 'unavailable';

/** "Check for updates" in Settings. */
export async function checkForUpdate(): Promise<UpdateResult> {
  if (!navigator.onLine) return 'offline';
  if (!registration) return 'unavailable';
  await registration.update();
  return registration.installing || registration.waiting ? 'updating' : 'latest';
}
