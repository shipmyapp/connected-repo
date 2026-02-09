import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import { openApiAuthProcedure } from "@backend/procedures/open_api_auth.procedure";
import { calculateSubscriptionParams } from "@backend/utils/calculate_subscription_params.utils";
import { subscriptionApiCreateInputZod, subscriptionGetActiveByTeamUserZod, subscriptionSelectAllZod } from "@connected-repo/zod-schemas/subscription.zod";
import z from "zod";


const createSubscription = openApiAuthProcedure
   .route({ method: "POST", tags: ["Subscriptions"] })
  .input(subscriptionApiCreateInputZod)
  .output(subscriptionSelectAllZod)
  .handler(async ({ 
    input: { apiProductQuantity, apiProductSku, teamUserReferenceId }, 
    context: { teamApi } 
  }) => {
    
    if (!teamApi.allowApiSubsCreationForSkus.includes(apiProductSku)) {
      throw new Error("API subscription creation not allowed for this SKU");
    };

    const { maxRequests, validityDays } = calculateSubscriptionParams(apiProductSku, apiProductQuantity);

    return await db.subscriptions.create({
      apiProductQuantity,
      apiProductSku,
      expiresAt: () => sql`NOW() + ${validityDays} * INTERVAL '1 day'`,
      maxRequests,
      requestsConsumed: 0,
      teamApiId: teamApi.teamApiId,
      teamUserReferenceId,
    })
  });

const getActiveSubscriptions = openApiAuthProcedure
   .route({ method: "GET", tags: ["Subscriptions"] })
  .input(subscriptionGetActiveByTeamUserZod)
  .output(z.array(subscriptionSelectAllZod))
  .handler(async ({ 
    input: { apiProductSku, teamUserReferenceId }, 
    context: { teamApi } 
  }) => {
    const query = db.subscriptions
      .selectAll()
      .where({
        teamApiId: teamApi.teamApiId,
        teamUserReferenceId,
        expiresAt: { gt: sql`NOW()` },
        requestsConsumed: { lt: sql`max_requests` },
      })
      .order({ createdAt: "DESC" });

    if (apiProductSku) {
      query.where({ apiProductSku });
    }

    return await query;
  });

export const subscriptionOpenApiRouter = {
  create: createSubscription,
  active: getActiveSubscriptions,
};