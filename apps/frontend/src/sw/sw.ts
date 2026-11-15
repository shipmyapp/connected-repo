import { env, isDev } from "@frontend/configs/env.config";
import { NAVIGATE_MESSAGE } from "@frontend/utils/sw-navigate";
import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
import {
	cleanupOutdatedCaches,
	createHandlerBoundToURL,
	precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
	__WB_DISABLE_DEV_LOGS?: boolean;
};

if (isDev) {
	self.__WB_DISABLE_DEV_LOGS = true;
}

// App shell: bundled build assets are precached so the app launches offline
// and from the home screen. The install dialog's chunk and the install
// pictures are left out (vite.config.ts globIgnores): fetched only when shown.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") {
		self.skipWaiting();
	}
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

// Backend paths always go to the network. Registered BEFORE the
// NavigationRoute so a future catch-all handler can never cache or delay
// them. The NavigationRoute denylist below mirrors this list: it is what
// keeps Google's OAuth redirect to /api/auth/callback/* from being served the
// cached SPA shell (the code would be dropped). /mcp and /.well-known/*
// (the application MCP and its OAuth discovery) are the backend's too.
const isBackendPath = (pathname: string): boolean =>
	pathname.startsWith("/api/") ||
	pathname.startsWith("/super-admin/") ||
	pathname.startsWith("/mobile-app/") ||
	pathname === "/mcp" ||
	pathname.startsWith("/mcp/") ||
	pathname.startsWith("/.well-known/");

registerRoute(({ url }) => isBackendPath(url.pathname), new NetworkOnly());

try {
	// `index.html` without a leading slash is the standard key in the precache
	// manifest. In development this can fail because Vite handles the manifest
	// differently.
	registerRoute(
		new NavigationRoute(createHandlerBoundToURL("index.html"), {
			denylist: [
				/^\/api\//,
				/^\/super-admin\//,
				/^\/mobile-app\//,
				/^\/mcp(\/|$)/,
				/^\/\.well-known\//,
			],
		}),
	);
} catch (err) {
	if (!isDev) {
		console.warn("[SW] NavigationRoute registration failed:", err);
	} else {
		console.debug("[SW] NavigationRoute skipped in dev mode (standard behavior).");
	}
}

// ─── Notification taps ──────────────────────────────────────────────────
//
/**
 * The page a tap on a push opens: its link, the URL it carries, or the app's
 * start. A notification Firebase showed itself keeps its payload under
 * `FCM_MSG`; one this worker showed keeps `{ url }`.
 */
const pushTargetOf = (notificationData: unknown): string => {
	const data = (notificationData ?? {}) as {
		url?: string;
		FCM_MSG?: { fcmOptions?: { link?: string }; data?: { url?: string } };
	};
	return data.FCM_MSG?.fcmOptions?.link ?? data.FCM_MSG?.data?.url ?? data.url ?? "/";
};

/**
 * A tap opens its screen in the app's own window: the window already on it is
 * focused; otherwise the open window is focused and told to go there through
 * the router (no reload, no second window: the DataWorker and pending writes
 * carry on); only with no window open is one opened. Other origins are ignored.
 */
const openOrFocus = async (url: string) => {
	const targetUrl = new URL(url, self.location.origin);
	if (targetUrl.origin !== self.location.origin) return;
	const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
	const exact = clientsList.find((client) => client.url === targetUrl.href);
	if (exact) return exact.focus();
	const open = clientsList.find((client) => client.focused) ?? clientsList[0];
	if (open) {
		const focused = await open.focus();
		focused.postMessage({
			type: NAVIGATE_MESSAGE,
			path: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
		});
		return focused;
	}
	return self.clients.openWindow?.(targetUrl.href);
};

// Registered BEFORE Firebase's own listener (added by getMessaging below), so
// a tap always opens something: Firebase's handler does nothing for a push
// without a link and stops every other listener from running.
self.addEventListener("notificationclick", (event) => {
	event.stopImmediatePropagation();
	event.notification.close();
	event.waitUntil(openOrFocus(pushTargetOf(event.notification.data)));
});

// ─── Firebase Cloud Messaging — background push handler ─────────────────
//
// Runs inside the same SW as Workbox precache + OPFS handlers. Do NOT
// create a separate firebase-messaging-sw.js file — a second SW at scope
// `/firebase-messaging-sw.js` would double-register push and race with
// this worker's `push` handling. The main thread passes THIS registration
// to `getToken(messaging, { serviceWorkerRegistration })` so Firebase
// binds its subscription to the worker running below.
//
// `onBackgroundMessage` only fires when the tab is NOT focused. When the
// tab is focused, Firebase suppresses the OS notification and delivers the
// message via `onMessage` on the main thread (see push.utils.ts).
if (
	env.VITE_FIREBASE_API_KEY &&
	env.VITE_FIREBASE_PROJECT_ID &&
	env.VITE_FIREBASE_MESSAGING_SENDER_ID &&
	env.VITE_FIREBASE_APP_ID
) {
	const firebaseApp = initializeApp({
		apiKey: env.VITE_FIREBASE_API_KEY,
		authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
		projectId: env.VITE_FIREBASE_PROJECT_ID,
		messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
		appId: env.VITE_FIREBASE_APP_ID,
	});
	const messaging = getMessaging(firebaseApp);

	onBackgroundMessage(messaging, (payload) => {
		// Silent-sync path (ADR-014): data-only push from the backend cron
		// (silent_sync_dispatch.cron.ts) asking open clients to drain the sync
		// queue. No user-visible notification. MUST stay before the
		// `payload.notification` check below (silent pushes carry no
		// notification block, so they would otherwise be shown).
		if (payload.data?.type === "silent-sync") {
			void (async () => {
				const clientsList = await self.clients.matchAll({
					type: "window",
					includeUncontrolled: true,
				});
				for (const client of clientsList) {
					client.postMessage({ type: "sync-now", ts: payload.data?.ts });
				}
			})();
			return;
		}

		// A push with `notification` (title and body: what Novu's FCM provider
		// sends for a workflow's push step) has already been shown by Firebase
		// before this runs; showing it here too was the duplicate every push
		// arrived with. Only a data-only push is shown here.
		if (payload.notification) return;
		const title = payload.data?.title ?? "Notification";
		const body = payload.data?.body ?? "";
		const url = payload.data?.url ?? payload.fcmOptions?.link ?? "/";
		void self.registration.showNotification(title, {
			body,
			icon: "/android-chrome-192x192.png",
			// Monochrome (white on transparent): Android draws the badge as a mask.
			badge: "/badge-96x96.png",
			data: { url },
			tag: payload.messageId,
		});
	});
}

// ─── OPFS virtual-media fetch handler ───────────────────────────────────
//
// Serves locally-cached blobs stored in OPFS at paths like
// `files/{id}/original.jpg`. `<img src="/opfs-media/files/abc/original.jpg" />`
// resolves via this handler so the UI can render pending uploads before
// they've been pushed to the CDN — same URL shape as the CDN URL so
// swapping to the CDN URL post-upload doesn't cause a re-fetch flicker.
self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;
	if (!url.pathname.startsWith("/opfs-media/")) return;

	const opfsPath = url.pathname.slice("/opfs-media/".length);
	event.respondWith(
		(async () => {
			try {
				const root = await navigator.storage.getDirectory();
				const parts = opfsPath.split("/");
				const fileName = parts.pop();
				if (!fileName) return new Response(null, { status: 404 });

				let dir: FileSystemDirectoryHandle = root;
				for (const part of parts) {
					dir = await dir.getDirectoryHandle(part);
				}
				const fileHandle = await dir.getFileHandle(fileName);
				const file = await fileHandle.getFile();
				return new Response(file, {
					headers: {
						"Content-Type": file.type || "application/octet-stream",
						"Cache-Control": "no-store",
					},
				});
			} catch {
				return new Response(null, { status: 404 });
			}
		})(),
	);
});
