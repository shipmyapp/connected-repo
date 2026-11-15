import { getDeviceEnv } from "@frontend/lib/device/device-env";
import { useDeviceHere } from "@frontend/lib/device/use-device-here";
import {
	isPushEnabledOnThisDevice,
	promptAndRegisterPush,
	revokePushForUser,
} from "@frontend/utils/push.utils";
import { useState } from "react";
import { toast } from "react-toastify";

/**
 * Push on this device, on or off. Whether it is on is the server's word
 * (`devices.here`); a switch turned in this visit holds until it is read again.
 * Registering or revoking waits on the server, so `pending` drives the UI.
 */
export const usePushToggle = () => {
	const device = getDeviceEnv();
	// Subscribed so the switch re-renders when the server's answer arrives.
	useDeviceHere();
	const [turned, setTurned] = useState<boolean | null>(null);
	const isOn = turned ?? isPushEnabledOnThisDevice();
	const [pending, setPending] = useState<"on" | "off" | null>(null);

	const toggle = async (nextOn: boolean) => {
		// Asking for permission while offline can leave the browser undecided with no register to follow.
		if (nextOn && typeof navigator !== "undefined" && !navigator.onLine) {
			toast.info("You're offline. Reconnect to change push settings.");
			return;
		}
		setPending(nextOn ? "on" : "off");
		try {
			if (nextOn) {
				const result = await promptAndRegisterPush();
				setTurned(result === "granted");
				if (result === "granted") toast.success("Push notifications enabled");
				else if (result === "denied")
					toast.info("Push is blocked by the browser. Enable it in site settings, then try again.");
				else toast.info("Push is not supported in this browser.");
			} else {
				await revokePushForUser({ stickyOptOut: true });
				setTurned(false);
				toast.success("Push notifications disabled on this device");
			}
		} finally {
			setPending(null);
		}
	};

	return {
		isOn,
		pending,
		toggle,
		needsInstallFirst: device.needsInstallForPush,
		isStandalone: device.isStandalone,
	};
};
