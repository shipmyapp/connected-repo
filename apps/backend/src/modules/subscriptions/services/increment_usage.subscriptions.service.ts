import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import { subscriptionAlertWebhookTaskDef } from "@backend/events/events.schema";
import { tbus } from "@backend/events/tbus";
import { logger } from "@backend/utils/logger.utils";
import type { ApiProductSku } from "@connected-repo/zod-schemas/enums.zod";
import type { TeamApiSelectAll } from "@connected-repo/zod-schemas/team_api.zod";

const SUBSCRIPTION_USAGE_ALERT_THRESHOLD_PERCENT = 90;

/**
 * Check if subscription has reached usage threshold and schedule webhook task if needed
 * Uses pg-tbus for reliable queuing with automatic retries and audit logging
 * @param subscription - The subscription object
 * @param team - The team with webhook configuration
 */
const checkAndScheduleWebhookAt90Percent = async (
  subscription: {
    subscriptionId: string;
    teamApiId: string;
    requestsConsumed: number;
    maxRequests: number;
    notifiedAt90PercentUse: number | null;
    apiProductSku: ApiProductSku;
  },
  team: TeamApiSelectAll,
) => {
  const usagePercent = (subscription.requestsConsumed / subscription.maxRequests) * 100;

  // Only schedule if:
  // 1. Usage is >= threshold percentage
  // 2. Notification hasn't been sent yet
  // 3. Team has webhook URL configured
  if (
    team?.subscriptionAlertWebhookUrl &&
    usagePercent >= SUBSCRIPTION_USAGE_ALERT_THRESHOLD_PERCENT &&
    !subscription.notifiedAt90PercentUse
  ) {
    const payload = {
      event: "subscription.usage_alert" as const,
      subscriptionId: subscription.subscriptionId,
      teamApiId: subscription.teamApiId,
      apiProductSku: subscription.apiProductSku,
      requestsConsumed: subscription.requestsConsumed,
      maxRequests: subscription.maxRequests,
      usagePercent: Math.round(usagePercent),
      timestamp: Date.now(),
    };

    // Schedule pg-tbus task
    // Note: This is intentionally outside the DB transaction to avoid blocking.
    // If scheduling fails, pg-tbus will retry. The notification flag prevents duplicate alerts.
    await tbus.send(
      subscriptionAlertWebhookTaskDef.from({
        subscriptionId: subscription.subscriptionId,
        teamApiId: subscription.teamApiId,
        payload,
      })
    );

    // Mark subscription as notified
    // This runs in a separate transaction to ensure it succeeds independently
    await db.subscriptions
      .find(subscription.subscriptionId)
      .where({ notifiedAt90PercentUse: null })
      .update({
        notifiedAt90PercentUse: () => sql`NOW()`,
      });
  }
};

/**
 * Atomically increment subscription usage and schedule webhook task if threshold reached
 * Uses pg-tbus for reliable task queuing with built-in retries and audit logging
 * @param subscriptionId - The subscription ID
 * @param team - The team with webhook configuration
 * @returns Updated subscription with new usage count
 */
export async function incrementSubscriptionUsage(subscriptionId: string, team: TeamApiSelectAll) {
  // Atomically increment requestsConsumed
  const updatedSubscription = await db.subscriptions
    .selectAll()
    .find(subscriptionId)
    .increment("requestsConsumed");

  if (!updatedSubscription) {
    throw new Error(`Subscription ${subscriptionId} not found`);
  }

  // Check if usage threshold reached and schedule webhook task
  // This is non-blocking - if it fails, the usage was still incremented
  checkAndScheduleWebhookAt90Percent(updatedSubscription, team)
    .catch(error => {
      // Log error but don't fail the request - the webhook is a side effect
      logger.error("Error scheduling webhook task at 90% usage:", error);
    });

  return updatedSubscription;
}
