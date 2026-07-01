# Service Worker

The service worker (`sw.ts`) only handles PWA asset caching via Workbox.

- `precacheAndRoute(self.__WB_MANIFEST)` — bundled build assets are precached at
  install time so the app is launchable from the home screen / offline shell.
- `NavigationRoute` is registered so navigations resolve from the precached
  `index.html` (SPA shell).
- `SKIP_WAITING` message handling supports the in-app update prompt
  (`PwaUpdatePrompt`).

The SW does NOT manage any data sync, SSE connections, IndexedDB, or
OPFS-backed media. The app talks to the backend directly over oRPC over fetch.
