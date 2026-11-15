import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import { activeSubscriptionsQuery } from "@backend/modules/subscriptions/services/get_active.subscriptions.service";
import type { ApiProductSku } from "@connected-repo/zod-schemas/enums.zod";
import { describe, expect, it } from "vitest";

const createApiTeam = () =>
	db.teamsApi.create({
		name: "Test API team",
		allowedDomains: [],
		allowedIPs: [],
		apiSecretHash: "not-a-real-hash",
		rateLimitPerMinute: 0,
		allowApiSubsCreationForSkus: ["journal_entry_create"],
	});

describe("API product storage", () => {
	it("stores and finds a subscription for a teams_api id (a ULID)", async () => {
		const team = await createApiTeam();
		await db.subscriptions.create({
			apiProductSku: "journal_entry_create",
			apiProductQuantity: 1,
			maxRequests: 100,
			requestsConsumed: 0,
			expiresAt: () => sql`NOW() + INTERVAL '30 days'`,
			teamApiId: team.teamApiId,
			teamUserReferenceId: "user-1",
		});
		const rows = await activeSubscriptionsQuery(team.teamApiId, "user-1");
		expect(rows.map((r) => r.teamApiId)).toEqual([team.teamApiId]);
		expect(
			await activeSubscriptionsQuery(team.teamApiId, "user-1", "journal_entry_create"),
		).toHaveLength(1);
	});

	it("logs a request for a teams_api id", async () => {
		const team = await createApiTeam();
		const log = await db.apiProductRequestLogs.create({
			teamApiId: team.teamApiId,
			teamUserReferenceId: "user-1",
			method: "POST",
			path: "/api/v1/journal-entries",
			ip: "127.0.0.1",
			responseTime: 0,
		});
		expect(log.teamApiId).toBe(team.teamApiId);
	});

	it("applies the SKU filter when one is given", () => {
		// The select list names every column; the filter shows in the WHERE clause.
		const whereClause = (apiProductSku?: ApiProductSku) => {
			const compiled = activeSubscriptionsQuery(
				"01HZX000000000000000000000",
				"u",
				apiProductSku,
			).toSQL();
			const text = "text" in compiled ? compiled.text : "";
			return text.slice(text.indexOf("WHERE"));
		};
		expect(whereClause()).not.toContain("api_product_sku");
		expect(whereClause("journal_entry_create")).toContain("api_product_sku");
	});
});
