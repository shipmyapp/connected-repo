import { db } from "@backend/db/db";
import { deviceKeyOf } from "@backend/modules/devices/device_cookie.devices.middleware";
import { buildInboxCredentials } from "@backend/modules/notifications/services/inbox_credentials.notifications.service";
import {
	registerFcmDevice,
	revokeFcmDevice,
	tokenDeviceKey,
} from "@backend/modules/notifications/services/register_device.notifications.service";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { rpcSuperAdminProcedure } from "@backend/procedures/super_admin.procedure";
import { triggerNotification } from "@backend/utils/notifications.utils";
import { devicePlatformZod } from "@connected-repo/zod-schemas/enums.zod";
import { uniqueTimeArrayZod, zString } from "@connected-repo/zod-schemas/zod_utils";
import { z } from "zod";

const TEST_PUSH_WORKFLOW_ID = "test-push";

const registerDevice = rpcProtectedProcedure
	.input(
		z.object({
			fcmToken: zString.min(1).max(4096),
			userAgent: zString.max(1024).nullish(),
			platform: devicePlatformZod.nullish(),
			pwaInstalled: z.boolean().optional(),
			pwaStandaloneLaunch: z.boolean().optional(),
		}),
	)
	.output(z.object({ ok: z.literal(true) }))
	.handler(async ({ input, context: { user, reqHeaders } }) => {
		// A native client's user agent is its HTTP library's; it may send a better one.
		const headers = new Headers(reqHeaders);
		if (input.userAgent) headers.set("user-agent", input.userAgent);
		await registerFcmDevice({
			userId: user.id,
			deviceKey: deviceKeyOf(reqHeaders) ?? tokenDeviceKey(input.fcmToken),
			fcmToken: input.fcmToken,
			headers,
			platform: input.platform ?? null,
			pwaInstalled: input.pwaInstalled,
			pwaStandaloneLaunch: input.pwaStandaloneLaunch,
		});
		return { ok: true as const };
	});

const revokeDevice = rpcProtectedProcedure
	.input(z.object({ fcmToken: zString.min(1).max(4096) }))
	.output(z.object({ ok: z.literal(true) }))
	.handler(async ({ input, context: { user, reqHeaders } }) => {
		await revokeFcmDevice({
			userId: user.id,
			deviceKey: deviceKeyOf(reqHeaders),
			fcmToken: input.fcmToken,
		});
		return { ok: true as const };
	});

const inboxCredentials = rpcProtectedProcedure
	.output(
		z
			.object({
				subscriberId: z.string(),
				subscriberHash: z.string(),
			})
			.nullable(),
	)
	.handler(async ({ context: { user } }) => {
		return buildInboxCredentials(user.id);
	});

// Postgres `time` values round-trip as `HH:mm:ss`; the zod contract is `HH:mm`.
// The users table declares an inner `.parse()` to strip the seconds but
// orchid does not fan array-inner parses across elements, so we normalise at
// the API boundary. Same treatment is applied wherever `journalReminderTimes`
// is emitted (see me.profile).
const stripSeconds = (t: string): string => (t.length > 5 ? t.slice(0, 5) : t);

const getReminderTimes = rpcProtectedProcedure
	.output(uniqueTimeArrayZod)
	.handler(async ({ context: { user } }) => {
		const row = await db.users.select("journalReminderTimes").findOptional(user.id);
		return (row?.journalReminderTimes ?? []).map(stripSeconds);
	});

const setReminderTimes = rpcProtectedProcedure
	.input(z.object({ times: uniqueTimeArrayZod }))
	.output(z.object({ times: uniqueTimeArrayZod }))
	.handler(async ({ input, context: { user } }) => {
		await db.users.where({ id: user.id }).update({
			journalReminderTimes: input.times,
		});
		return { times: input.times };
	});

// Behind super-admin gate — any authenticated user calling this could spam
// their own OS-level push and consume Novu quota. The super-admin procedure
// also layers a 30 req/min rate limit for a second line of defense.
const testSendPush = rpcSuperAdminProcedure
	.input(
		z.object({
			title: zString.min(1).max(200).default("Hello from Novu"),
			body: zString.min(1).max(500).default("Push + Inbox pipe is live."),
		}),
	)
	.output(z.object({ ok: z.literal(true) }))
	.handler(async ({ input, context: { user } }) => {
		await triggerNotification({
			workflowId: TEST_PUSH_WORKFLOW_ID,
			subscriberId: user.id,
			payload: { title: input.title, body: input.body },
		});
		return { ok: true as const };
	});

export const notificationsRouter = {
	registerDevice,
	revokeDevice,
	inboxCredentials,
	getReminderTimes,
	setReminderTimes,
	testSendPush,
};
