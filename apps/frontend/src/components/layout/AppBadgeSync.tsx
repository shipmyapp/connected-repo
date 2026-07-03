import { useSyncStatus } from "@frontend/components/layout/useSyncStatus";
import { useEffect, useRef } from "react";

/**
 * Mirrors the pending sync count onto the OS-level app-icon badge via
 * the Web App Badging API (`navigator.setAppBadge` / `clearAppBadge`).
 *
 * Renders nothing — it's a side-effect component. Mounted inside
 * `AppLayout` so it only runs for authenticated users. On unmount it
 * clears the badge so a stale count doesn't linger after logout.
 *
 * Support:
 *   - Chrome / Edge on Windows, macOS, ChromeOS: works in a tab AND as
 *     installed PWA.
 *   - Safari 16.4+ on macOS/iOS: only when installed as a PWA AND the
 *     user has granted `Notification.requestPermission()`. The API
 *     rejects silently otherwise — we swallow.
 *   - Firefox: not supported — the whole thing is a no-op.
 */
interface BadgeNavigator {
	setAppBadge?: (count?: number) => Promise<void>;
	clearAppBadge?: () => Promise<void>;
}

function hasBadgeApi(nav: Navigator): nav is Navigator & Required<BadgeNavigator> {
	return "setAppBadge" in nav && "clearAppBadge" in nav;
}

export const AppBadgeSync = () => {
	const snap = useSyncStatus();
	const pending = snap.pendingEntries + snap.pendingFiles;
	const lastSet = useRef<number | null>(null);

	useEffect(() => {
		if (typeof navigator === "undefined") return;
		if (!hasBadgeApi(navigator)) return;

		// Only touch the badge when the value actually changes so we
		// don't spam the OS on every re-render / useSyncStatus refresh.
		if (lastSet.current === pending) return;
		lastSet.current = pending;

		if (pending > 0) {
			navigator.setAppBadge(pending).catch(() => {
				// Silently swallowed — most common cause is Safari without
				// notifications permission, or the badge is unavailable
				// (browser tab that isn't the installed PWA). No user-
				// visible failure mode.
			});
		} else {
			navigator.clearAppBadge().catch(() => {});
		}
	}, [pending]);

	useEffect(() => {
		return () => {
			if (typeof navigator === "undefined") return;
			if (!hasBadgeApi(navigator)) return;
			navigator.clearAppBadge().catch(() => {});
		};
	}, []);

	return null;
};
