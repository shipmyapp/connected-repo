import { db } from "@backend/db/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthClientsCleanupTick } from "./oauth_clients_cleanup.cron";
import { reconcileFcmTokensTick } from "./reconcile_fcm_tokens.cron";
import { reminderDispatchTick } from "./reminder_dispatch.cron";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@backend/utils/backend-error-tracking.utils", () => ({
	captureBackendException: capture,
}));

describe("a failing cron tick", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		capture.mockClear();
	});

	it.each([
		["cron.reconcile_fcm_tokens", reconcileFcmTokensTick],
		["cron.reminder_dispatch", reminderDispatchTick],
		["cron.oauth_clients_cleanup", oauthClientsCleanupTick],
	])("%s reports the error", async (handler, tick) => {
		const boom = new Error("database unreachable");
		vi.spyOn(db, "$transaction").mockRejectedValueOnce(boom);
		await tick();
		expect(capture).toHaveBeenCalledWith(boom, { captureAll: true, tags: { handler } });
	});
});
