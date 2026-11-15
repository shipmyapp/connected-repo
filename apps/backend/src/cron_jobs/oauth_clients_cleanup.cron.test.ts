import { db } from "@backend/db/db";
import { defaultContext } from "@backend/test/setup";
import { describe, expect, it } from "vitest";
import { oauthClientsCleanupTick } from "./oauth_clients_cleanup.cron";

const DAY_MS = 24 * 60 * 60 * 1000;

const app = (clientId: string, ageDays: number) =>
	db.oauthClients.create({
		clientId,
		redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
		createdAt: new Date(Date.now() - ageDays * DAY_MS),
	});

describe("oauthClientsCleanupTick", () => {
	it("removes apps nobody connected after a week, and keeps connected or recent ones", async () => {
		const userId = defaultContext?.user.id;
		if (!userId) throw new Error("defaultContext not initialized");
		await app("unused-old", 8);
		await app("connected-old", 8);
		await app("unused-recent", 1);
		await app("token-old", 8);
		await db.oauthConsents.create({ clientId: "connected-old", userId, scopes: ["read"] });
		await db.oauthRefreshTokens.create({
			clientId: "token-old",
			userId,
			token: "hashed",
			scopes: ["read"],
			expiresAt: new Date(Date.now() + DAY_MS),
		});

		await oauthClientsCleanupTick();

		const left = await db.oauthClients
			.where({ clientId: { in: ["unused-old", "connected-old", "unused-recent", "token-old"] } })
			.pluck("clientId");
		expect(left.sort()).toEqual(["connected-old", "token-old", "unused-recent"]);
	});
});
