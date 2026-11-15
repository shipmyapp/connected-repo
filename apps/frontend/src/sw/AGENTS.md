# Service Worker

The service worker (`sw.ts`) handles PWA shell caching, push, and OPFS media serving.

- `precacheAndRoute(self.__WB_MANIFEST)`: bundled assets precached at install (offline shell). The install dialog's chunk (`pwa-install*.js`) and `screenshots/**` are excluded in `vite.config.ts` (`globIgnores`).
- `NetworkOnly` for `/api/`, `/super-admin/`, `/mobile-app/` (`isBackendPath`), registered BEFORE the `NavigationRoute` whose denylist mirrors it.
- `SKIP_WAITING` message handling supports the in-app update prompt (`PwaUpdatePrompt`).
- **Notification taps**: `notificationclick` is registered BEFORE Firebase's listener and stops it (`stopImmediatePropagation`); `pushTargetOf` reads `FCM_MSG` (notifications Firebase showed) or `data.url`; `openOrFocus` focuses the window already on the URL, else focuses the open window and posts `{ type: "app:navigate", path }` (`utils/sw-navigate.ts`, handled by `useServiceWorkerNavigation` in `RootLayout`: router navigation, no reload), else opens a window.
- **FCM push**: a silent push (`data.type === "silent-sync"`) is fanned out to open clients as `sync-now` (DataWorker runs a sync); a push with a `notification` block is NOT shown again (Firebase already showed it); a data-only push is shown with `/android-chrome-192x192.png` and the monochrome `/badge-96x96.png`.
- **OPFS media**: intercepts `fetch` for `/opfs-media/*` and streams the bytes from OPFS (ADR-009).

The SW does NOT manage the Dexie/IndexedDB database or the pull-delta sync
protocol itself — that lives in the DataWorker. There is **no SSE**; data sync
is client-pull over oRPC-over-fetch. The SW's only sync role is relaying the
silent-push wake signal.
