import { registerSW } from 'virtual:pwa-register';

export function initPWA() {
  // Register service worker for PWA functionality
  console.info('[PWA] Post-mount initialization starting...');

  registerSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      if (r) {
        console.info('[PWA] SW registered: ', r);

        // Monitor installation state
        const sw = r.installing || r.waiting || r.active;
        if (sw) {
          sw.addEventListener('statechange', (e) => {
            const state = (e.target as any).state;
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