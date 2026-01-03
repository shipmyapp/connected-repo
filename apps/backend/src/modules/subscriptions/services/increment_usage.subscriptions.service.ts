import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import { logger } from "@backend/utils/logger.utils";
import type { ApiProductSku } from "@connected-repo/zod-schemas/enums.zod";
import { TeamSelectAll } from "@connected-repo/zod-schemas/team.zod";
import { subscriptionAlertWebhookPayloadZod } from "@connected-repo/zod-schemas/webhook_call_queue.zod";

const SUBSCRIPTION_USAGE_ALERT_THRESHOLD_PERCENT = 90;
const WEBHOOK_MAX_RETRY_ATTEMPTS = 3;

/**
 * Check if subscription has reached usage threshold and queue webhook if needed
 * @param subscription - The subscription object
 */
const checkAndQueueWebhookAt90Percent = async (
  subscription: {
    subscriptionId: string;
    teamId: string;
    requestsConsumed: number;
    maxRequests: number;
    notifiedAt90PercentUse: number | null;
    apiProductSku: ApiProductSku;
  },
  team: TeamSelectAll,
) => {
  const usagePercent = (subscription.requestsConsumed / subscription.maxRequests) * 100;

  // Only queue if:
  // 1. Usage is >= threshold percentage
  // 2. Notification hasn't been sent yet
  if (
    team?.subscriptionAlertWebhookUrl &&
    usagePercent >= SUBSCRIPTION_USAGE_ALERT_THRESHOLD_PERCENT &&
    !subscription.notifiedAt90PercentUse
  ) {
    const payload = subscriptionAlertWebhookPayloadZod.parse({
      event: "subscription.usage_alert",
      subscriptionId: subscription.subscriptionId,
      teamId: subscription.teamId,
      apiProductSku: subscription.apiProductSku,
      requestsConsumed: subscription.requestsConsumed,
      maxRequests: subscription.maxRequests,
      usagePercent: Math.round(usagePercent),
      timestamp: Date.now(),
    });

    return db.$transaction(async () => {
      // Queue webhook
      const createWebhook = db.webhookCallQueues.create({
        teamId: subscription.teamId,
        subscriptionId: subscription.subscriptionId,
        webhookUrl: team.subscriptionAlertWebhookUrl!,
        status: "Pending",
        attempts: 0,
        maxAttempts: WEBHOOK_MAX_RETRY_ATTEMPTS,
        scheduledFor: () => sql`NOW()`,
        payload,
      });

      // Mark subscription as notified
      const markNotified = db.subscriptions
        .find(subscription.subscriptionId)
        .where({ notifiedAt90PercentUse: null })
        .update({
          notifiedAt90PercentUse: () => sql`NOW()`,
        });

      return await Promise.all([createWebhook, markNotified]);
    });
  }
}

/**
 * Atomically increment subscription usage and check for usage threshold
 * @param subscriptionId - The subscription ID
 * @returns Updated subscription with new usage count
 */
export async function incrementSubscriptionUsage(subscriptionId: string, team: TeamSelectAll) {
  // Atomically increment requestsConsumed
  const updatedSubscription = await db.subscriptions
    .selectAll()
    .find(subscriptionId)
    .increment("requestsConsumed");

  if (!updatedSubscription) {
    throw new Error(`Subscription ${subscriptionId} not found`);
  }

  // Check if usage threshold reached and webhook not already sent
  await checkAndQueueWebhookAt90Percent(updatedSubscription, team)
    .catch(error => {
      // Not throwing error as it might fail due to race-conditions in marking notified.
      logger.error("Error checking and queueing webhook at 90% usage:", error);
    });

  return updatedSubscription;
}