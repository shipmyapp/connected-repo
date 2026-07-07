# Service Worker

The service worker (`sw.ts`) handles PWA shell caching, push, and OPFS media serving.

- `precacheAndRoute(self.__WB_MANIFEST)` — bundled build assets are precached at
  install time so the app is launchable from the home screen / offline shell.
- `NavigationRoute` is registered so navigations resolve from the precached
  `index.html` (SPA shell).
- `SKIP_WAITING` message handling supports the in-app update prompt
  (`PwaUpdatePrompt`).
- **FCM push**: handles background push messages. A *silent* push (no
  notification payload) is fanned out to open clients as a postMessage that
  wakes the DataWorker's `SyncOrchestrator` to run a sync; a normal push shows
  a notification.
- **OPFS media**: intercepts `fetch` for virtual media URLs and streams the
  bytes from OPFS, so `<img>`/`<video>` can render offline blobs without
  `URL.createObjectURL` (ADR-009).

The SW does NOT manage the Dexie/IndexedDB database or the pull-delta sync
protocol itself — that lives in the DataWorker. There is **no SSE**; data sync
is client-pull over oRPC-over-fetch. The SW's only sync role is relaying the
silent-push wake signal.
