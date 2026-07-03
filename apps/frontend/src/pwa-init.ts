import { getDataProxy } from '@frontend/worker/worker.proxy';
import { registerSW } from 'virtual:pwa-register';

/**
 * True when the app is running as an installed PWA rather than a regular
 * browser tab. iOS Safari uses navigator.standalone (non-standard, still
 * required); every other browser reports via display-mode media query.
 */
function isInstalledPWA(): boolean {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}

export async function requestStoragePersistence() {
  if (!navigator.storage || !navigator.storage.persist) {
    return;
  }

  const isPersisted = await navigator.storage.persisted();
  if (isPersisted) {
    return;
  }

  // Always try once at start — a browser tab MIGHT grant it based on engagement
  // signals (Chrome/Edge). If denied here (common on iOS Safari and cold Chrome
  // sessions), register a one-shot retry for when the user installs the PWA —
  // browsers grant persist more readily to installed apps.
  const result = await navigator.storage.persist();
  if (result) {
    console.info('[Storage] Persistence granted.');
    return;
  }

  // Browser policy call, not an error — log at debug so it doesn't look
  // like a bug in DevTools.
  console.debug('[Storage] Persistence denied by browser policy; will retry on install.');

  if (!isInstalledPWA()) {
    window.addEventListener(
      'appinstalled',
      () => {
        void requestStoragePersistence();
      },
      { once: true },
    );
  }
}

export function initPWA() {
  // Request persistence as early as possible
  requestStoragePersistence();

  // Register service worker for PWA functionality
  registerSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      if (r) {
        // Monitor installation state
        const sw = r.installing || r.waiting || r.active;
        if (sw) {
          sw.addEventListener('statechange', () => {
            const state = sw.state;
            if (state === 'installing') {
              console.info('[PWA] SW installing...');
            }
            if (state === 'activated') {
              console.info('[PWA] SW activated.');
            }
          });
        }
      }
    },
    onRegisterError(error: unknown) {
      console.error('[PWA] SW registration failed: ', error);
    },
  });

  // Listen for messages from the SW.
  //   - `SW_PRECACHE_PROGRESS`: precache progress signal (dev only).
  //   - `sync-now`: silent-sync push landed. The SW can't reach the
  //     DataWorker directly (workers can't share Comlink handles across
  //     SW ↔ page boundaries), so it fans out to open clients and each
  //     open client kicks its own sync. Idempotent — processQueue
  //     dedupes concurrent calls.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_PRECACHE_PROGRESS') {
        const { progress, asset } = event.data.payload;
        if (asset) {
          console.info(`[PWA] Syncing ${asset}...`, 60 + (progress * 0.3));
        }
        return;
      }
      if (event.data?.type === 'sync-now') {
        void (async () => {
          try {
            const proxy = await getDataProxy();
            await proxy.sync.processQueue();
          } catch (err) {
            console.warn('[PWA] sync-now: processQueue failed', err);
          }
        })();
      }
    });
  }
}