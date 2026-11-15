import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import {
	CONNECTED_APP_SCOPE_ENUM,
	type ConnectedApp,
	type ConnectedAppScopeDto,
	connectedAppDescribeInputZod,
	connectedAppIdentityZod,
	connectedAppIdInputZod,
	connectedAppSetScopesInputZod,
	connectedAppZod,
} from "@connected-repo/zod-schemas/connected_app.zod";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { userMcpResourceUrl } from "./oauth.user_mcp.config";
import { platformOf } from "./services/platform.user_mcp.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_ACTIONS = 8;

const isScope = (value: string): value is ConnectedAppScopeDto =>
	(CONNECTED_APP_SCOPE_ENUM as readonly string[]).includes(value);

const clientOrThrow = async (clientId: string) => {
	const client = await db.oauthClients.where({ clientId }).takeOptional();
	if (!client || client.disabled)
		throw new ORPCError("NOT_FOUND", { status: 404, message: "That app is not known." });
	return client;
};

/** Ends a connection at once: its consent and every token it holds. */
const disconnectApp = async (userId: string, clientId: string): Promise<void> => {
	await db.$transaction(async () => {
		await db.oauthAccessTokens.where({ userId, clientId }).delete();
		await db.oauthRefreshTokens.where({ userId, clientId }).delete();
		await db.oauthConsents.where({ userId, clientId }).delete();
	});
};

/**
 * Connected apps on the profile (ADR-045): which AI apps the
 * person signed in, what each may do, when it was last used and what it
 * changed; narrow what one may do, or disconnect it. And, for the consent
 * screen, who an app is. Session-only (`rpcProtectedProcedure`): not team-scoped.
 */
export const connectedAppsRouter = {
	/** The address a person adds in their AI app. */
	address: rpcProtectedProcedure
		.route({ method: "GET", tags: ["Connected apps"] })
		.output(z.object({ url: z.url() }))
		.handler(() => ({ url: userMcpResourceUrl() })),

	list: rpcProtectedProcedure
		.route({ method: "GET", tags: ["Connected apps"] })
		.output(z.array(connectedAppZod))
		.handler(async ({ context: { user } }): Promise<ConnectedApp[]> => {
			const consents = await db.oauthConsents
				.where({ userId: user.id })
				.order({ updatedAt: "DESC" });
			if (consents.length === 0) return [];
			const clients = await db.oauthClients.where({
				clientId: { in: consents.map((consent) => consent.clientId) },
			});
			const since = new Date(Date.now() - 30 * DAY_MS);
			const result: ConnectedApp[] = [];
			for (const consent of consents) {
				const client = clients.find((row) => row.clientId === consent.clientId);
				if (!client) continue;
				const [lastToken, actionsLast30Days, recent] = await Promise.all([
					db.oauthAccessTokens
						.where({ userId: user.id, clientId: client.clientId })
						.order({ createdAt: "DESC" })
						.select("createdAt")
						.takeOptional(),
					db.connectedAppActions
						.where({ userId: user.id, clientId: client.clientId, createdAt: { gt: since } })
						.count(),
					db.connectedAppActions
						.where({ userId: user.id, clientId: client.clientId })
						.order({ createdAt: "DESC" })
						.limit(RECENT_ACTIONS)
						.select("id", "what", "createdAt", "teamId"),
				]);
				result.push({
					clientId: client.clientId,
					...platformOf(client),
					name: client.name,
					uri: client.uri,
					scopes: consent.scopes.filter(isScope),
					connectedAt: consent.createdAt.getTime(),
					lastUsedAt: lastToken ? lastToken.createdAt.getTime() : null,
					actionsLast30Days,
					recent: recent.map((action) => ({
						id: action.id,
						what: action.what,
						at: action.createdAt,
						teamId: action.teamId,
					})),
				});
			}
			return result;
		}),

	/** The consent screen's header: the redirect address must be one the app registered. */
	describe: rpcProtectedProcedure
		.route({ method: "GET", tags: ["Connected apps"] })
		.input(connectedAppDescribeInputZod)
		.output(connectedAppIdentityZod)
		.handler(async ({ input }) => {
			const client = await clientOrThrow(input.clientId);
			if (!client.redirectUris.includes(input.redirectUri)) {
				throw new ORPCError("BAD_REQUEST", {
					status: 400,
					message: "That sign-in address is not this app's.",
				});
			}
			return {
				clientId: client.clientId,
				...platformOf(client, input.redirectUri),
				name: client.name,
				uri: client.uri,
			};
		}),

	/** Takes permissions away from an app; adding one means connecting again, through the consent screen. */
	setScopes: rpcProtectedProcedure
		.route({ method: "POST", tags: ["Connected apps"] })
		.input(connectedAppSetScopesInputZod)
		.output(z.object({ scopes: z.array(z.string()) }))
		.handler(async ({ input, context: { user } }) => {
			const consent = await db.oauthConsents
				.where({ userId: user.id, clientId: input.clientId })
				.takeOptional();
			if (!consent)
				throw new ORPCError("NOT_FOUND", { status: 404, message: "That app is not connected." });
			const scopes = consent.scopes.filter(
				(scope) =>
					scope === "offline_access" ||
					scope === "read" ||
					(isScope(scope) && input.scopes.includes(scope)),
			);
			await db.oauthConsents.find(consent.id).update({ scopes, updatedAt: new Date() });
			return { scopes };
		}),

	disconnect: rpcProtectedProcedure
		.route({ method: "POST", tags: ["Connected apps"] })
		.input(connectedAppIdInputZod)
		.output(z.object({ ok: z.literal(true) }))
		.handler(async ({ input, context: { user } }) => {
			await disconnectApp(user.id, input.clientId);
			return { ok: true as const };
		}),
};
