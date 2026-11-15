import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { usePwaInstallCtx } from "@frontend/components/notifications/PwaInstallHost";
import { env } from "@frontend/configs/env.config";
import { mayAskNow, useAsksStore } from "@frontend/lib/asks/asks.store";
import { getDeviceEnv } from "@frontend/lib/device/device-env";
import { useTenant } from "@frontend/tenant/TenantContext";
import { promptAndRegisterPush } from "@frontend/utils/push.utils";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

/** Push can be asked for here at all: Firebase configured and the browser not already decided. */
const canAskHere = (): boolean => {
	if (!env.VITE_FIREBASE_VAPID_KEY || !env.VITE_FIREBASE_API_KEY) return false;
	if (typeof Notification === "undefined") return getDeviceEnv().needsInstallForPush;
	return Notification.permission === "default";
};

/**
 * Dashboard nudge for push, on the ask ladder: Not now holds 3, 7, 14, then
 * 30 days, kept on the account; never twice a visit; never where push is
 * already on here. On an iPhone outside the installed app the CTA installs
 * first (Web Push in Safari works only inside the installed app).
 */
export const NotificationBanner = () => {
	const [visible, setVisible] = useState(false);
	const [pending, setPending] = useState(false);
	const pwa = usePwaInstallCtx();
	const { brand } = useTenant();
	const needsInstallFirst = getDeviceEnv().needsInstallForPush;

	useEffect(() => {
		if (!canAskHere()) return;
		let isLive = true;
		void mayAskNow("push").then((isDue) => {
			if (!isLive || !isDue) return;
			useAsksStore.getState().markShown("push");
			setVisible(true);
		});
		return () => {
			isLive = false;
		};
	}, []);

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
			setVisible(false);
		}
	};

	const handleInstall = async () => {
		void useAsksStore.getState().record("push", "pending_install");
		try {
			await pwa.install();
		} catch (error) {
			console.error("[NotificationBanner] install failed", error);
			toast.error("Couldn't open install prompt.");
		}
	};

	const handleNotNow = () => {
		void useAsksStore.getState().record("push", "snoozed");
		setVisible(false);
	};

	return (
		<Alert
			severity="info"
			sx={{ borderRadius: 2, boxShadow: 1 }}
			action={
				<Stack direction="row" spacing={1}>
					<Button onClick={handleNotNow} color="inherit" size="small" disabled={pending}>
						Not now
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
				? `Add ${brand.appName} to your home screen to receive your journal reminders — iOS Safari doesn't deliver push from a browser tab.`
				: "Get a nudge to log your journal — turn on notifications and pick a time from your Profile."}
		</Alert>
	);
};
