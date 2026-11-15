import { novu } from "@backend/configs/novu.config";
import { db } from "@backend/db/db";
import { describeClientDevice } from "@backend/utils/client-info.utils";
import { upsertSubscriber } from "@backend/utils/notifications.utils";
import type { AppPlatform, DeviceReportInput } from "@connected-repo/zod-schemas/device.zod";
import { UAParser } from "ua-parser-js";
import { ulid } from "ulid";
import { syncNovuFcmCredentials } from "./push.devices.service";

/** The kind of device from the user agent, when the app did not say (an adapter, a native build). */
const platformFrom = (os: string | null): AppPlatform =>
	os === "iOS" ? "ios" : os === "Android" ? "android" : "desktop";

/**
 * What the device in the person's hand reports: one upsert of its row, keyed by
 * the account and the device key. The user agent gives the browser, OS, model
 * and OS version; the app gives the rest. Only what the report names changes; a
 * repeated report only moves `last_seen_at`. A standalone opening stamps the
 * install and the latest opening; the browser's own word (`isInstalled`) stamps
 * the install.
 *
 * A push address arrives only when push is on here for this account. If another
 * row holds it (a phone that changed accounts, or a row copied from
 * `push_devices`), that row lets it go first (`replaced`). When the address is
 * new to this row, or the row had stopped, Novu is synced for this account and
 * for every account that let it go, in the same transaction: a Novu failure
 * rolls the report back.
 */
export const reportDevice = async (params: {
	userId: string;
	deviceKey: string;
	report: DeviceReportInput;
	headers: Headers;
	now?: number;
}): Promise<void> => {
	const { userId, deviceKey, report, headers, now = Date.now() } = params;
	const agent = describeClientDevice(headers);
	const osVersion = new UAParser(headers.get("user-agent") ?? "").getOS().version ?? null;
	const described = {
		platform: report.platform ?? platformFrom(agent.os),
		browser: agent.browser?.slice(0, 64) ?? null,
		os: agent.os?.slice(0, 64) ?? null,
		model: agent.device?.slice(0, 64) ?? null,
		osVersion: osVersion?.slice(0, 32) ?? null,
	};

	await db.$transaction(async () => {
		await db.devices
			.create({ id: ulid(), userId, deviceKey, ...described, firstSeenAt: now, lastSeenAt: now })
			.onConflictDoNothing(["userId", "deviceKey"]);
		const row = await db.devices.where({ userId, deviceKey }).forUpdate().take();

		const isStandalone = report.isStandalone ?? row.isStandalone;
		const isInstalledNow = report.isStandalone === true || report.isInstalled === true;
		await db.devices.find(row.id).update({
			...described,
			isStandalone,
			...(report.screen !== undefined ? { screen: report.screen } : {}),
			...(report.timeZone !== undefined ? { timeZone: report.timeZone } : {}),
			...(report.language !== undefined ? { language: report.language } : {}),
			...(isInstalledNow && row.installedAt === null ? { installedAt: now } : {}),
			...(report.isStandalone === true ? { openedInstalledAt: now } : {}),
			...(report.pushPermission !== undefined ? { pushPermission: report.pushPermission } : {}),
			lastSeenAt: now,
		});

		const token = report.fcmToken;
		if (!token) return;
		const isNewHere = row.fcmToken !== token || row.pushOffAt !== null;
		const holders = await db.devices
			.where({ fcmToken: token, pushOffAt: null })
			.whereNot({ id: row.id })
			.select("id", "userId");
		if (holders.length > 0) {
			// The partial unique index allows one live holder: let the others go first.
			await db.devices.where({ id: { in: holders.map((holder) => holder.id) } }).update({
				pushOffAt: now,
				pushOffReason: "replaced",
			});
		}
		if (isNewHere) {
			await db.devices
				.find(row.id)
				.update({ fcmToken: token, pushOffAt: null, pushOffReason: null });
		}
		if (!isNewHere && holders.length === 0) return;
		if (!novu) return;
		const user = await db.users.find(userId).select("email", "name");
		await upsertSubscriber(userId, { email: user.email ?? null, firstName: user.name ?? null });
		await syncNovuFcmCredentials(userId);
		// The account it left stops reaching this phone now, not at the nightly reconcile.
		for (const previous of new Set(holders.map((holder) => holder.userId))) {
			if (previous !== userId) await syncNovuFcmCredentials(previous);
		}
	});
};
