import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { usePwaInstallCtx } from "@frontend/components/notifications/PwaInstallHost";
import { env } from "@frontend/configs/env.config";
import { getDeviceEnv } from "@frontend/utils/device.utils";
import { promptAndRegisterPush } from "@frontend/utils/push.utils";
import { useState } from "react";
import { toast } from "react-toastify";

const BANNER_DISMISSED_KEY = "push.bannerDismissed";
const OPTED_OUT_KEY = "push.optedOut";
const REGISTERED_TOKEN_KEY = "push.fcmToken";

const shouldShowBanner = (): boolean => {
	if (!env.VITE_FIREBASE_VAPID_KEY) return false;
	if (!env.VITE_FIREBASE_API_KEY) return false;
	if (typeof Notification === "undefined") return false;
	if (Notification.permission === "denied") return false;
	if (Notification.permission === "granted") {
		// Already granted — banner is only for prompting; the sync effect
		// registers the token silently.
		return false;
	}
	if (localStorage.getItem(BANNER_DISMISSED_KEY) === "true") return false;
	if (localStorage.getItem(OPTED_OUT_KEY) === "true") return false;
	if (localStorage.getItem(REGISTERED_TOKEN_KEY)) return false;
	return true;
};

/**
 * Dashboard nudge for users who never opted into push (dismissed the
 * post-first-entry modal, or opened the app before that flow existed).
 * Dismissible; sticks-dismissed across sessions. On iOS + non-standalone,
 * the CTA becomes "Install app" instead of "Enable notifications" because
 * Web Push in Safari is only available inside an installed PWA.
 */
export const NotificationBanner = () => {
	const [visible, setVisible] = useState(shouldShowBanner);
	const [pending, setPending] = useState(false);
	const pwa = usePwaInstallCtx();
	const device = getDeviceEnv();
	const needsInstallFirst = device.isIOS && !device.isStandalone;

	if (!visible) return null;

	const handleEnable = async () => {
		setPending(true);
		const result = await promptAndRegisterPush();
		setPending(false);
		if (result === "granted") {
			toast.success("Notifications enabled");
			setVisible(false);
		} else if (result === "denied") {
			toast.info("Enable notifications in your browser settings to receive push alerts.");
		}
	};

	const handleInstall = async () => {
		try {
			await pwa.install();
		} catch (error) {
			console.error("[NotificationBanner] install failed", error);
			toast.error("Couldn't open install prompt.");
		}
	};

	const handleDismiss = () => {
		localStorage.setItem(BANNER_DISMISSED_KEY, "true");
		setVisible(false);
	};

	return (
		<Alert
			severity="info"
			sx={{ borderRadius: 2, boxShadow: 1 }}
			action={
				<Stack direction="row" spacing={1}>
					<Button onClick={handleDismiss} color="inherit" size="small" disabled={pending}>
						Dismiss
					</Button>
					<Button
						onClick={needsInstallFirst ? handleInstall : handleEnable}
						variant="contained"
						size="small"
						disabled={pending}
					>
						{needsInstallFirst ? "Install app" : pending ? "Requesting…" : "Enable notifications"}
					</Button>
				</Stack>
			}
		>
			{needsInstallFirst
				? "Add OneQ to your home screen to receive daily journal reminders — iOS Safari doesn't deliver push from a browser tab."
				: "Get a daily nudge to log your journal — turn on notifications and pick a time from your Profile."}
		</Alert>
	);
};
