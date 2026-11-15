import { db } from "@backend/db/db";
import type { DeviceInstallTryInput } from "@connected-repo/zod-schemas/device.zod";
import { nextInstallTry } from "@connected-repo/zod-schemas/devices/install_tries.rules";
import { reportDevice } from "./report.devices.service";

/**
 * One step of an install try on this device, or the person's answer to "what
 * happened?", kept on the device's own row, so "tried here and did not install" is told apart from "installed on
 * another phone". The rules are `nextInstallTry`, unchanged.
 */
export const recordDeviceInstallTry = async (params: {
	userId: string;
	deviceKey: string;
	input: DeviceInstallTryInput;
	headers: Headers;
	now?: number;
}): Promise<void> => {
	const { userId, deviceKey, input, headers, now = Date.now() } = params;
	const step =
		input.step === "answered"
			? input.reason
				? { step: input.step, reason: input.reason }
				: null
			: { step: input.step };
	if (!step) return;
	// The try may come before the first report: the row is made (or seen) first.
	await reportDevice({ userId, deviceKey, report: {}, headers, now });
	await db.$transaction(async () => {
		const row = await db.devices
			.where({ userId, deviceKey })
			.forUpdate()
			.select("id", "installTries")
			.take();
		await db.devices
			.find(row.id)
			.update({ installTries: nextInstallTry(row.installTries ?? undefined, step, now) });
	});
};
