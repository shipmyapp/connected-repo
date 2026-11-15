import { isInAppPath, NAVIGATE_MESSAGE } from "@frontend/utils/sw-navigate";
import { useEffect } from "react";
import { useNavigate } from "react-router";

/**
 * Shows the screen a notification tap asked for in the window already open,
 * through the router: no reload, no second
 * window. Only the app's own paths are followed.
 */
export function useServiceWorkerNavigation() {
	const navigate = useNavigate();
	useEffect(() => {
		const container = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
		if (!container) return;
		const onMessage = (event: MessageEvent) => {
			const data: unknown = event.data;
			if (
				typeof data !== "object" ||
				data === null ||
				!("type" in data) ||
				data.type !== NAVIGATE_MESSAGE
			)
				return;
			const path = "path" in data ? data.path : null;
			if (isInAppPath(path)) navigate(path);
		};
		container.addEventListener("message", onMessage);
		return () => container.removeEventListener("message", onMessage);
	}, [navigate]);
}
