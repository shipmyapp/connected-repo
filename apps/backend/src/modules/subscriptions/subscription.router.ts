import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import { activeSubscriptionsQuery } from "@backend/modules/subscriptions/services/get_active.subscriptions.service";
import { openApiAuthProcedure } from "@backend/procedures/open_api_auth.procedure";
import { calculateSubscriptionParams } from "@backend/utils/calculate_subscription_params.utils";
import {
	subscriptionApiCreateInputZod,
	subscriptionGetActiveByTeamUserZod,
	subscriptionSelectAllZod,
} from "@connected-repo/zod-schemas/subscription.zod";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

const createSubscription = openApiAuthProcedure
	.route({ method: "POST", tags: ["Subscriptions"] })
	.input(subscriptionApiCreateInputZod)
	.output(subscriptionSelectAllZod)
	.handler(
		async ({
			input: { apiProductQuantity, apiProductSku, teamUserReferenceId },
			context: { teamApi },
		}) => {
			if (!teamApi.allowApiSubsCreationForSkus.includes(apiProductSku)) {
				// A refusal, not a fault: a plain Error reached the client as a 500.
				throw new ORPCError("FORBIDDEN", {
					status: 403,
					message: "API subscription creation not allowed for this SKU",
				});
			}

			const { maxRequests, validityDays } = calculateSubscriptionParams(
				apiProductSku,
				apiProductQuantity,
			);

			return await db.subscriptions.create({
				apiProductQuantity,
				apiProductSku,
				expiresAt: () => sql`NOW() + ${validityDays} * INTERVAL '1 day'`,
				maxRequests,
				requestsConsumed: 0,
				teamApiId: teamApi.teamApiId,
				teamUserReferenceId,
			});
		},
	);

const getActiveSubscriptions = openApiAuthProcedure
	.route({ method: "GET", tags: ["Subscriptions"] })
	.input(subscriptionGetActiveByTeamUserZod)
	.output(z.array(subscriptionSelectAllZod))
	.handler(async ({ input: { apiProductSku, teamUserReferenceId }, context: { teamApi } }) => {
		return await activeSubscriptionsQuery(teamApi.teamApiId, teamUserReferenceId, apiProductSku);
	});

export const subscriptionOpenApiRouter = {
	create: createSubscription,
	active: getActiveSubscriptions,
};
