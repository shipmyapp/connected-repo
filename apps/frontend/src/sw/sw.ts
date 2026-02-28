import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import * as Comlink from 'comlink';
import { isDev } from '@frontend/configs/env.config';
import { SSEManager } from './sse/sse.manager.sw';

declare const self: ServiceWorkerGlobalScope & {
  __WB_DISABLE_DEV_LOGS?: boolean;
};

if (isDev) {
  self.__WB_DISABLE_DEV_LOGS = true;
}

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
  event.waitUntil(
    Promise.all([
      self.clients.claim()
    ])
  );
});

// ── Virtual Media Provider ────────────────────────────────────────

const OPFS_MEDIA_PREFIX = '/opfs-media/';

/**
 * Intercept fetch requests for virtual OPFS media URLs.
 * Serves files directly from the Origin Private File System.
 */
self.addEventListener('fetch', (event: any) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.startsWith(OPFS_MEDIA_PREFIX)) {
    event.respondWith((async () => {
      try {
        const path = url.pathname.slice(OPFS_MEDIA_PREFIX.length);
        const parts = path.split('/');
        const fileName = parts.pop()!;
        
        let currentDir = await navigator.storage.getDirectory();
        for (const part of parts) {
          currentDir = await currentDir.getDirectoryHandle(part);
        }

        const fileHandle = await currentDir.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        
        return new Response(file, {
          headers: {
            'Content-Type': file.type,
            'Cache-Control': 'public, max-age=31536000', // Cache heavily as IDs are immutable paths
          }
        });
      } catch (error) {
        console.warn(`[SW] OPFS Virtual Media failed for ${url.pathname}:`, error);
        return new Response('File not found in OPFS', { status: 404 });
      }
    })());
  }
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