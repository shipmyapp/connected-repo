import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import { WebhookCallQueueSelectAll } from "@connected-repo/zod-schemas/webhook_call_queue.zod";
import axios from "axios";

export const initiateWebhookCallService = async (
  queueEntry: WebhookCallQueueSelectAll
) => {
  const team = await db.teams.find(queueEntry.teamId).select("subscriptionAlertWebhookBearerToken", "subscriptionAlertWebhookUrl");

  if(!team.subscriptionAlertWebhookUrl) {
    return;
  }
  const webhookUrl = team.subscriptionAlertWebhookUrl;
  const bearerToken = team.subscriptionAlertWebhookBearerToken;

  try {
    await axios.post(webhookUrl, queueEntry.payload, {
      ...(bearerToken
        ? {headers: {
          "Authorization": `Bearer ${bearerToken}`
        }}
        : {}
      )
    });
    await db.webhookCallQueues
      .find(queueEntry.webhookCallQueueId)
      .update({
        webhookUrl,
        status: "Sent",
        attempts: () => sql`"attempts" + 1`,
        lastAttemptAt: () => sql`NOW()`,
        sentAt: () => sql`NOW()`,
      });
  } catch (err) {
    await db.webhookCallQueues
      .find(queueEntry.webhookCallQueueId)
      .update({
        webhookUrl,
        status: "Failed",
        attempts: () => sql`"attempts" + 1`,
        lastAttemptAt: () => sql`NOW()`,
        errorMessage: err instanceof Error ? err.message : "Unknown error"
      });
  }
}