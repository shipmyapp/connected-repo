import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import type { ApiProductSku } from "@connected-repo/zod-schemas/enums.zod";

/**
 * Find an active subscription for a team and product
 * @param teamApiId - The team API UUID
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