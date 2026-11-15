import { db } from "@backend/db/db";
import { createRateLimitMiddleware } from "@backend/middlewares/rate_limit.middleware";
import { deviceKeyOf } from "@backend/modules/devices/device_cookie.devices.middleware";
import {
	type RpcAuthenticatedContext,
	rpcProtectedProcedure,
	rpcSessionProcedure,
} from "@backend/procedures/protected.procedure";
import {
	type RpcContextWithHeaders,
	rpcPublicProcedure,
} from "@backend/procedures/public.procedure";
import { rpcSensitiveProcedure } from "@backend/procedures/sensitive.procedure";
import { getClientIpAddress } from "@backend/utils/client-info.utils";
import {
	accountDeletionBlockerZod,
	accountDeletionRequestOutputZod,
	accountExportZod,
	accountSessionZod,
} from "@connected-repo/zod-schemas/account.zod";
import { acceptLegalInputZod } from "@connected-repo/zod-schemas/legal.zod";
import { z } from "zod";
import {
	cancelAccountDeletion,
	findDeletionBlockers,
	requestAccountDeletion,
} from "./services/deletion.users.service";
import { exportAccountData } from "./services/export.users.service";
import {
	listAccountSessions,
	revokeAccountSession,
	revokeOtherAccountSessions,
} from "./services/sessions.users.service";

const ok = z.object({ ok: z.literal(true) });

// ─── Deletion ──────────────────────────────────────────────────────────

/** The teams the person must leave or delete first; empty = may delete. */
const deletionBlockers = rpcProtectedProcedure
	.route({ method: "GET", tags: ["Account"] })
	.output(z.array(accountDeletionBlockerZod))
	.handler(({ context: { user } }) => findDeletionBlockers(user.id));

const requestDeletion = rpcSensitiveProcedure
	.route({ method: "POST", tags: ["Account"] })
	.output(accountDeletionRequestOutputZod)
	.handler(({ context: { user, session } }) =>
		requestAccountDeletion({ userId: user.id, currentSessionId: session.id }),
	);

// The one procedure a restricted (deletion-pending) account may call.
const cancelDeletion = rpcSessionProcedure
	.route({ method: "POST", tags: ["Account"] })
	.output(ok)
	.handler(async ({ context: { user } }) => {
		await cancelAccountDeletion(user.id);
		return { ok: true as const };
	});

// ─── Export ────────────────────────────────────────────────────────────

const exportData = rpcSensitiveProcedure
	.use(
		createRateLimitMiddleware<RpcAuthenticatedContext>({
			bucketFn: (ctx) => ({ key: `export:user:${ctx.user.id}`, limit: 3, windowSeconds: 3600 }),
			label: "export",
		}),
	)
	.route({ method: "POST", tags: ["Account"] })
	.output(accountExportZod)
	.handler(({ context: { user } }) => exportAccountData(user.id));

// ─── Sessions ──────────────────────────────────────────────────────────

const sessionsLimit = createRateLimitMiddleware<RpcAuthenticatedContext>({
	bucketFn: (ctx) => ({ key: `sessions:user:${ctx.user.id}`, limit: 30, windowSeconds: 60 }),
	label: "sessions",
});

const listSessions = rpcProtectedProcedure
	.route({ method: "GET", tags: ["Account"] })
	.output(z.array(accountSessionZod))
	.handler(({ context: { user, session } }) => listAccountSessions(user.id, session.id));

const revokeSession = rpcProtectedProcedure
	.use(sessionsLimit)
	.route({ method: "POST", tags: ["Account"] })
	.input(z.object({ sessionId: z.string().min(1).max(255) }))
	.output(ok)
	.handler(async ({ input, context: { user, session } }) => {
		await revokeAccountSession({
			userId: user.id,
			currentSessionId: session.id,
			sessionId: input.sessionId,
		});
		return { ok: true as const };
	});

// Browser and mobile sessions only: connected apps are disconnected on their own card.
const revokeOtherSessions = rpcProtectedProcedure
	.use(sessionsLimit)
	.route({ method: "POST", tags: ["Account"] })
	.output(z.object({ ended: z.number().int().min(0) }))
	.handler(async ({ context: { user, session } }) => ({
		ended: await revokeOtherAccountSessions(user.id, session.id),
	}));

// ─── Terms and privacy ─────────────────────────────────────────────────

// Only the current LEGAL_VERSION is accepted (z.literal), with the server's time.
const acceptLegal = rpcProtectedProcedure
	.route({ method: "POST", tags: ["Account"] })
	.input(acceptLegalInputZod)
	.output(z.object({ legalAcceptedVersion: z.string(), legalAcceptedAt: z.number() }))
	.handler(async ({ input, context: { user } }) => {
		const legalAcceptedAt = Date.now();
		await db.users.find(user.id).update({ legalAcceptedVersion: input.version, legalAcceptedAt });
		return { legalAcceptedVersion: input.version, legalAcceptedAt };
	});

// ─── Local copy on a device of a purged account ────────────────────────

const erasureLimit = createRateLimitMiddleware<RpcContextWithHeaders>({
	bucketFn: (ctx) => ({
		key: `erasure:ip:${getClientIpAddress(ctx.reqHeaders)}`,
		limit: 30,
		windowSeconds: 60,
	}),
	label: "erasure",
});

/**
 * Public, keyed by the device cookie only: "was an account that used this
 * device deleted?" The answer goes to that device and names nobody.
 */
const localDataErasure = rpcPublicProcedure
	.use(erasureLimit)
	.route({ method: "GET", tags: ["Account"] })
	.output(z.object({ erase: z.boolean() }))
	.handler(async ({ context: { reqHeaders } }) => {
		const deviceKey = deviceKeyOf(reqHeaders);
		if (!deviceKey) return { erase: false };
		return { erase: await db.erasedDeviceKeys.where({ deviceKey }).exists() };
	});

/** The device erased its local copy: forget its key. */
const ackLocalDataErasure = rpcPublicProcedure
	.use(erasureLimit)
	.route({ method: "POST", tags: ["Account"] })
	.output(ok)
	.handler(async ({ context: { reqHeaders } }) => {
		const deviceKey = deviceKeyOf(reqHeaders);
		if (deviceKey) await db.erasedDeviceKeys.where({ deviceKey }).delete();
		return { ok: true as const };
	});

export const accountRouter = {
	deletionBlockers,
	requestDeletion,
	cancelDeletion,
	exportData,
	listSessions,
	revokeSession,
	revokeOtherSessions,
	acceptLegal,
	localDataErasure,
	ackLocalDataErasure,
};
