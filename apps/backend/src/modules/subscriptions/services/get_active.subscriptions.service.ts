import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import type { ApiProductSku } from "@connected-repo/zod-schemas/enums.zod";

/**
 * Find an active subscription for a team and product
 * @param teamApiId - The teams_api id (a ULID)
 * @param apiProductSku - The API product SKU
 * @returns Active subscription or null if not found
 */
export async function findActiveSubscription(
	teamApiId: string,
	teamUserReferenceId: string,
	apiProductSku: ApiProductSku,
) {
	const subscription = await db.subscriptions
		.where({
			teamApiId,
			teamUserReferenceId,
			apiProductSku,
			expiresAt: { gt: sql`NOW()` },
			requestsConsumed: { lt: sql`"max_requests"` },
		})
		.order({ createdAt: "DESC" })
		.takeOptional();

	return subscription;
}

/**
 * Every live subscription of one API user, newest first; only one product's
 * when `apiProductSku` is given. Orchid queries are immutable: each `where`
 * returns a new query, so the optional filter is applied by reassigning.
 * Returns the table's default selection (every column), typed as the table
 * query so the exported type can be written out.
 */
export function activeSubscriptionsQuery(
	teamApiId: string,
	teamUserReferenceId: string,
	apiProductSku?: ApiProductSku,
): typeof db.subscriptions {
	let query = db.subscriptions
		.where({
			teamApiId,
			teamUserReferenceId,
			expiresAt: { gt: sql`NOW()` },
			requestsConsumed: { lt: sql`"max_requests"` },
		})
		.order({ createdAt: "DESC" });
	if (apiProductSku) query = query.where({ apiProductSku });
	return query;
}
