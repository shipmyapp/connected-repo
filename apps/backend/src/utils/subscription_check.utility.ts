import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import { ApiProductRequestLog } from "@backend/modules/logs/tables/api_product_request_logs.table";
import { findActiveSubscription } from "@backend/modules/subscriptions/services/get_active.subscriptions.service";
import { API_PRODUCTS, type ApiProductSku } from "@connected-repo/zod-schemas/enums.zod";

/**
 * Check Subscription and Update Log
 * Checks for active subscription and updates the request log if none exists
 */
export const checkSubscriptionAndUpdateLog = async (
	logEntry: ApiProductRequestLog,
	productRoute: string,
	productSku: ApiProductSku,
	teamId: string, 
	teamUserReferenceId: string, 
) => {
	const subscription = await findActiveSubscription(
		teamId, 
		teamUserReferenceId, 
		productSku
	);

	const productRouteCheck = API_PRODUCTS.some(product => product.sku === productSku && product.apiRoute === productRoute);

	const newLogEntry = subscription && productRouteCheck
		? logEntry 
		: await db.apiProductRequestLogs
			.selectAll()
			.find(logEntry.apiProductRequestId)
			.update({
				status: !subscription ? "No active subscription" : "Invalid API route",
				responseText: !subscription ? "No active subscription found for this team and user." : "Invalid API route",
				responseTime: () => sql`EXTRACT(EPOCH FROM NOW()) - EXTRACT(EPOCH FROM "created_at")`,
			});

	return { newLogEntry, subscription };
};