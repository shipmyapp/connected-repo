import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import * as Comlink from 'comlink';
import { isDev } from '@frontend/configs/env.config';
import { SSEManager } from './sse/sse.manager.sw';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

if(isDev) {
  self.addEventListener('install', () => {
    self.skipWaiting();
  });
}

// ── SSE Manager & Comlink RPC ──────────────────────────────────────

const sseManager = new SSEManager();

/**
 * Handle Comlink handshake for Service Worker.
 * Exposes the manager on the provided MessagePort.
 */
self.addEventListener('message', (event) => {
    if (event.data?.type === 'CAN_HAS_COMLINK') {
        const port = event.ports[0];
        if (port) {
            Comlink.expose(sseManager, port);
        }
    }

    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

try {
  // Use index.html without leading slash as it's the standard key in the precache manifest
  // In development, this might fail because the manifest is handled differently by Vite.
  registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
} catch (err) {
  if (!isDev) {
    console.warn('[SW] NavigationRoute registration failed:', err);
  } else {
    // In dev, we expect this might fail if precaching isn't fully active
    console.debug('[SW] NavigationRoute skipped in dev mode (standard behavior).');
  }
}