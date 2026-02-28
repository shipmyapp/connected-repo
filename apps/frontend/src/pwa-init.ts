import { registerSW } from 'virtual:pwa-register';

export async function requestStoragePersistence() {
  if (!navigator.storage || !navigator.storage.persist) {
    return;
  }

  const isPersisted = await navigator.storage.persisted();
  if (isPersisted) {
    return;
  }

  const result = await navigator.storage.persist();
  if (result) {
    console.info('[Storage] Persistence granted.');
  } else {
    console.warn('[Storage] Persistence denied.');
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

  // Listen for precaching progress from SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_PRECACHE_PROGRESS') {
        const { progress, asset } = event.data.payload;
        if (asset) {
          console.info(`[PWA] Syncing ${asset}...`, 60 + (progress * 0.3));
        }
      }
    });
  }
}