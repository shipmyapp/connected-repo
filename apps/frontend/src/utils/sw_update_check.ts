/**
 * Imperative "check for a new service worker" trigger.
 *
 * `useRegisterSW` polls the SW automatically on interval, but when the user
 * taps the version label we want to force a check now and give them feedback.
 * Returns a coarse status the caller can toast:
 *   - "checking-failed": no SW support / no registration / update() threw.
 *   - "already-updating": a new worker is already installing or waiting;
 *     the update prompt will land on its own.
 *   - "up-to-date": update() ran and no new worker showed up.
 *
 * `updatefound` doesn't fire when the fetched SW byte-matches the current
 * one, so we race a 6s timer. If nothing installs by then the app is
 * genuinely up to date.
 */
export type SwUpdateCheckResult =
	| "checking-failed"
	| "already-updating"
	| "up-to-date";

export async function checkForSwUpdate(): Promise<SwUpdateCheckResult> {
	if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
		return "checking-failed";
	}
	try {
		const registration = await navigator.serviceWorker.getRegistration();
		if (!registration) return "checking-failed";

		if (registration.installing || registration.waiting) {
			return "already-updating";
		}

		const foundNewWorker = new Promise<boolean>((resolve) => {
			const onUpdateFound = () => {
				registration.removeEventListener("updatefound", onUpdateFound);
				resolve(true);
			};
			registration.addEventListener("updatefound", onUpdateFound);
			window.setTimeout(() => {
				registration.removeEventListener("updatefound", onUpdateFound);
				resolve(false);
			}, 6000);
		});

		await registration.update();
		const found = await foundNewWorker;
		return found ? "already-updating" : "up-to-date";
	} catch (error) {
		console.warn("[SW] update check failed", error);
		return "checking-failed";
	}
}
