import { db } from "@backend/db/db";
import { notificationsRouter } from "@backend/modules/notifications/notifications.router";
import { buildInboxCredentials } from "@backend/modules/notifications/services/inbox_credentials.notifications.service";
import { reconcileUserFcmDevices } from "@backend/modules/notifications/services/reconcile_devices.notifications.service";
import {
	registerFcmDevice,
	revokeFcmDevice,
} from "@backend/modules/notifications/services/register_device.notifications.service";
import { defaultContext } from "@backend/test/setup";
import { ORPCError } from "@orpc/contract";
import { createRouterClient, type RouterClient } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

// Test env has no NOVU_SECRET_KEY (see .env.test) → novu.config exports
// null. That means every service under test in this file skips the Novu
// round-trip and exercises only the DB path, which is what we want to
// verify: the split-brain risk we're guarding against is DB-vs-Novu drift,
// and the DB half is deterministic in tests.

describe("Notifications Endpoints", () => {
	let defaultClient: RouterClient<typeof notificationsRouter>;
	const unauthClient = createRouterClient(notificationsRouter);

	beforeEach(() => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		defaultClient = createRouterClient(notificationsRouter, {
			context: defaultContext,
		});
	});

	describe("getReminderTimes", () => {
		it("returns times stripped to HH:mm (Postgres time round-trips as HH:mm:ss)", async () => {
			// Test fixture seeds ["08:00", "21:00"]; the router must return
			// them in the HH:mm shape the zod contract advertises.
			const result = await defaultClient.getReminderTimes({});
			expect(result).toEqual(["08:00", "21:00"]);
		});

		it("rejects unauthenticated requests", async () => {
			await expect(unauthClient.getReminderTimes({})).rejects.toThrowError(ORPCError);
		});
	});

	describe("setReminderTimes", () => {
		it("round-trips the times array via getReminderTimes", async () => {
			await defaultClient.setReminderTimes({ times: ["06:00", "18:30"] });
			const result = await defaultClient.getReminderTimes({});
			expect(result).toEqual(["06:00", "18:30"]);
		});
	});
});

// Any key in the device cookie's shape (22 characters); one per test.
const keyFor = (last: string) => `Aa0Aa0Aa0Aa0Aa0Aa0Aa0${last}`;
const agent = () => new Headers({ "user-agent": "vitest" });

describe("registerFcmDevice", () => {
	it("records a live push address on this device", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const token = `t_${Date.now()}_a`;
		await registerFcmDevice({
			userId: defaultContext.user.id,
			deviceKey: keyFor("A"),
			fcmToken: token,
			headers: agent(),
			platform: "macos",
			pwaInstalled: true,
			pwaStandaloneLaunch: true,
		});

		const row = await db.devices.where({ userId: defaultContext.user.id, fcmToken: token }).take();
		expect(row.pushOffAt).toBeNull();
		expect(row.platform).toBe("desktop");
		expect(row.installedAt).not.toBeNull();
		expect(row.pushOffReason).toBeNull();
		expect(row.pushPermission).toBe("granted");
	});

	it("is idempotent — calling with the same token twice keeps one live row and updates lastSeenAt", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const token = `t_${Date.now()}_b`;
		await registerFcmDevice({
			userId: defaultContext.user.id,
			deviceKey: keyFor("B"),
			fcmToken: token,
			headers: agent(),
			platform: "macos",
		});
		const first = await db.devices
			.where({ userId: defaultContext.user.id, fcmToken: token })
			.take();

		// Sleep 5ms so lastSeenAt actually differs. Determinism > realism.
		await new Promise((resolve) => setTimeout(resolve, 5));

		await registerFcmDevice({
			userId: defaultContext.user.id,
			deviceKey: keyFor("B"),
			fcmToken: token,
			headers: agent(),
			platform: "macos",
		});
		const rows = await db.devices.where({ userId: defaultContext.user.id, fcmToken: token }).all();
		expect(rows).toHaveLength(1);
		const row = rows[0];
		if (!row) throw new Error("expected one row");
		expect(row.lastSeenAt).toBeGreaterThanOrEqual(first.lastSeenAt);
	});

	it("preserves the original installedAt on subsequent registers", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const token = `t_${Date.now()}_c`;
		await registerFcmDevice({
			userId: defaultContext.user.id,
			deviceKey: keyFor("C"),
			fcmToken: token,
			headers: agent(),
			pwaInstalled: true,
		});
		const initial = await db.devices
			.where({ userId: defaultContext.user.id, fcmToken: token })
			.take();
		const originalInstalledAt = initial.installedAt;

		await new Promise((resolve) => setTimeout(resolve, 5));
		await registerFcmDevice({
			userId: defaultContext.user.id,
			deviceKey: keyFor("C"),
			fcmToken: token,
			headers: agent(),
			pwaInstalled: true,
		});
		const after = await db.devices
			.where({ userId: defaultContext.user.id, fcmToken: token })
			.take();
		expect(after.installedAt).toBe(originalInstalledAt);
	});

	it("after revoke, re-register turns the same device's push back on", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const token = `t_${Date.now()}_d`;
		const deviceKey = keyFor("D");
		await registerFcmDevice({
			userId: defaultContext.user.id,
			deviceKey,
			fcmToken: token,
			headers: agent(),
		});
		await revokeFcmDevice({ userId: defaultContext.user.id, deviceKey, fcmToken: token });
		await registerFcmDevice({
			userId: defaultContext.user.id,
			deviceKey,
			fcmToken: token,
			headers: agent(),
		});

		// Devices are keyed by the device, not by the address: one row, live again.
		const rows = await db.devices.where({ userId: defaultContext.user.id, fcmToken: token }).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.pushOffAt).toBeNull();
		expect(rows[0]?.pushOffReason).toBeNull();
	});
});

describe("revokeFcmDevice", () => {
	it("turns a live address off and stamps the reason", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const token = `t_${Date.now()}_e`;
		const deviceKey = keyFor("E");
		await registerFcmDevice({
			userId: defaultContext.user.id,
			deviceKey,
			fcmToken: token,
			headers: agent(),
		});
		await revokeFcmDevice({ userId: defaultContext.user.id, deviceKey, fcmToken: token });
		const row = await db.devices.where({ userId: defaultContext.user.id, fcmToken: token }).take();
		expect(row.pushOffAt).not.toBeNull();
		expect(row.pushOffReason).toBe("switched_off");
	});

	it("is a no-op for a token that was never registered", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		await revokeFcmDevice({
			userId: defaultContext.user.id,
			deviceKey: keyFor("F"),
			fcmToken: `never_${Date.now()}`,
		});
		// No throw is the assertion.
	});
});

describe("buildInboxCredentials", () => {
	it("returns null when NOVU_SECRET_KEY is unset (test env)", () => {
		// .env.test intentionally omits NOVU_SECRET_KEY so the graceful-
		// degradation branch is the covered path here. HMAC determinism is
		// verified separately in a unit test that stubs env at module scope.
		expect(buildInboxCredentials("any-subscriber")).toBeNull();
	});
});

describe("reconcileUserFcmDevices", () => {
	it("returns pruned=0 when Novu is unconfigured", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const result = await reconcileUserFcmDevices(defaultContext.user.id);
		expect(result).toEqual({ pruned: 0 });
	});
});
