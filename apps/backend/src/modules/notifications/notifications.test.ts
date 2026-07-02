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
			await expect(unauthClient.getReminderTimes({})).rejects.toThrowError(
				ORPCError,
			);
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

describe("registerFcmDevice", () => {
	it("inserts a new active row for a first-time token", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const token = `t_${Date.now()}_a`;
		await registerFcmDevice({
			userId: defaultContext.user.id,
			fcmToken: token,
			userAgent: "vitest",
			platform: "macos",
			pwaInstalled: true,
			pwaStandaloneLaunch: true,
		});

		const row = await db.pushDevices
			.where({ userId: defaultContext.user.id, fcmToken: token })
			.take();
		expect(row.uninstalledAt).toBeNull();
		expect(row.platform).toBe("macos");
		expect(row.pwaInstalledAt).not.toBeNull();
		expect(row.deactivationReason).toBeNull();
	});

	it("is idempotent — calling with the same token twice keeps one active row and updates lastSeenAt", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const token = `t_${Date.now()}_b`;
		await registerFcmDevice({
			userId: defaultContext.user.id,
			fcmToken: token,
			platform: "macos",
		});
		const first = await db.pushDevices
			.where({ userId: defaultContext.user.id, fcmToken: token })
			.take();

		// Sleep 5ms so lastSeenAt actually differs. Determinism > realism.
		await new Promise((resolve) => setTimeout(resolve, 5));

		await registerFcmDevice({
			userId: defaultContext.user.id,
			fcmToken: token,
			platform: "macos",
		});
		const rows = await db.pushDevices
			.where({ userId: defaultContext.user.id, fcmToken: token })
			.all();
		expect(rows).toHaveLength(1);
		const row = rows[0];
		if (!row) throw new Error("expected one row");
		expect(row.lastSeenAt).toBeGreaterThanOrEqual(first.lastSeenAt);
	});

	it("preserves the original pwaInstalledAt on subsequent registers", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const token = `t_${Date.now()}_c`;
		await registerFcmDevice({
			userId: defaultContext.user.id,
			fcmToken: token,
			pwaInstalled: true,
		});
		const initial = await db.pushDevices
			.where({ userId: defaultContext.user.id, fcmToken: token })
			.take();
		const originalPwaAt = initial.pwaInstalledAt;

		await new Promise((resolve) => setTimeout(resolve, 5));
		await registerFcmDevice({
			userId: defaultContext.user.id,
			fcmToken: token,
			pwaInstalled: true,
		});
		const after = await db.pushDevices
			.where({ userId: defaultContext.user.id, fcmToken: token })
			.take();
		expect(after.pwaInstalledAt).toBe(originalPwaAt);
	});

	it("after revoke, re-register lands as a NEW row and the soft-deleted history stays", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const token = `t_${Date.now()}_d`;
		await registerFcmDevice({
			userId: defaultContext.user.id,
			fcmToken: token,
		});
		await revokeFcmDevice({
			userId: defaultContext.user.id,
			fcmToken: token,
		});
		await registerFcmDevice({
			userId: defaultContext.user.id,
			fcmToken: token,
		});

		const rows = await db.pushDevices
			.where({ userId: defaultContext.user.id, fcmToken: token })
			.all();
		expect(rows).toHaveLength(2);
		// Ordering by createdAt is unreliable — both rows land within the
		// same millisecond in a sub-second test. Partition by state instead.
		const active = rows.filter((r) => r.uninstalledAt === null);
		const revoked = rows.filter((r) => r.uninstalledAt !== null);
		expect(active).toHaveLength(1);
		expect(revoked).toHaveLength(1);
		const [activeRow] = active;
		const [revokedRow] = revoked;
		if (!activeRow || !revokedRow) throw new Error("expected partitioned rows");
		expect(revokedRow.deactivationReason).toBe("user_revoked");
		expect(activeRow.deactivationReason).toBeNull();
	});
});

describe("revokeFcmDevice", () => {
	it("soft-deletes a matching active row and stamps deactivation_reason", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const token = `t_${Date.now()}_e`;
		await registerFcmDevice({
			userId: defaultContext.user.id,
			fcmToken: token,
		});
		await revokeFcmDevice({
			userId: defaultContext.user.id,
			fcmToken: token,
		});
		const row = await db.pushDevices
			.where({ userId: defaultContext.user.id, fcmToken: token })
			.take();
		expect(row.uninstalledAt).not.toBeNull();
		expect(row.deactivationReason).toBe("user_revoked");
	});

	it("is a no-op for a token that was never registered", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		await revokeFcmDevice({
			userId: defaultContext.user.id,
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
