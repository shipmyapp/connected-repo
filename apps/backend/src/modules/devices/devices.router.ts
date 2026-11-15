import { deviceKeyOf } from "@backend/modules/devices/device_cookie.devices.middleware";
import { deviceStateFor } from "@backend/modules/devices/services/device_state.devices.service";
import { recordDeviceInstallTry } from "@backend/modules/devices/services/install_tries.devices.service";
import { pushOffDevice } from "@backend/modules/devices/services/push.devices.service";
import { reportDevice } from "@backend/modules/devices/services/report.devices.service";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import {
	deviceHereZod,
	deviceInstallTryInputZod,
	devicePushOffInputZod,
	deviceReportInputZod,
} from "@connected-repo/zod-schemas/device.zod";
import { z } from "zod";

const ok = z.object({ ok: z.literal(true) });

/**
 * What the device in the person's hand is and can do: sent on start, on
 * return to the front, on a permission change and with a new push address. A
 * call without a device key (no cookie, no `x-device-id`) is taken and
 * changes nothing.
 */
const report = rpcProtectedProcedure
	.route({ method: "POST", tags: ["Devices"] })
	.input(deviceReportInputZod)
	.output(ok)
	.handler(async ({ input, context: { user, reqHeaders } }) => {
		const deviceKey = deviceKeyOf(reqHeaders);
		if (deviceKey)
			await reportDevice({ userId: user.id, deviceKey, report: input, headers: reqHeaders });
		return { ok: true as const };
	});

/** A step of an install try on this device, or the answer to "what happened?". */
const recordInstallTry = rpcProtectedProcedure
	.route({ method: "POST", tags: ["Devices"] })
	.input(deviceInstallTryInputZod)
	.output(ok)
	.handler(async ({ input, context: { user, reqHeaders } }) => {
		const deviceKey = deviceKeyOf(reqHeaders);
		if (deviceKey)
			await recordDeviceInstallTry({ userId: user.id, deviceKey, input, headers: reqHeaders });
		return { ok: true as const };
	});

/** Push stops on this device: switched off here, or signing out. */
const pushOff = rpcProtectedProcedure
	.route({ method: "POST", tags: ["Devices"] })
	.input(devicePushOffInputZod)
	.output(ok)
	.handler(async ({ input, context: { user, reqHeaders } }) => {
		await pushOffDevice({
			userId: user.id,
			deviceKey: deviceKeyOf(reqHeaders),
			fcmToken: input.fcmToken,
			reason: input.reason,
		});
		return { ok: true as const };
	});

/** What this device may be offered: installed here, push here, the install offer due. */
const here = rpcProtectedProcedure
	.route({ method: "GET", tags: ["Devices"] })
	.output(deviceHereZod)
	.handler(async ({ context: { user, reqHeaders } }) =>
		deviceStateFor(user.id, deviceKeyOf(reqHeaders)),
	);

export const devicesRouter = { report, recordInstallTry, pushOff, here };
