import { db } from "@backend/db/db";
import { incrementSubscriptionUsage } from "@backend/modules/subscriptions/services/increment_usage.subscriptions.service";
import { openApiAuthProcedure } from "@backend/procedures/open_api_auth.procedure";
import { createRequestLog } from "@backend/utils/create_request_log.utility";
import { checkSubscriptionAndUpdateLog } from "@backend/utils/subscription_check.utility";
import { apiProductRequestLogSelectAllZod, openapiResponseInputZod } from "@connected-repo/zod-schemas/api_product_request_log.zod";
import { openapiJournalEntryCreateInputZod, openapiJournalEntryCreateResponseOutputZod } from "@connected-repo/zod-schemas/journal_entry.zod";

const createJournalEntryRequest = openApiAuthProcedure
   .route({ method: "POST", tags: ["Journal Entries"] })
  .input(openapiJournalEntryCreateInputZod)
  .output(apiProductRequestLogSelectAllZod)
  .handler(async ({
    context: { reqHeaders, team },
    input
  }) => {
    const logEntry = await createRequestLog(
      input,
      reqHeaders,
      "/api/v1/journal-entries/create-request",
      team.teamId
    );

    const { newLogEntry, subscription } = await checkSubscriptionAndUpdateLog(
      logEntry,
      "journal-entries",
      input.apiProductSku,
      team.teamId,
      input.teamUserReferenceId
    );

    if(!subscription) {
      return newLogEntry;
    };

    db.$transaction(async () => {
      const entry = await db.journalEntries.create(input.data);
      const increment = await incrementSubscriptionUsage(subscription.subscriptionId, team);
      return Promise.all([entry, increment]);
    })

    return newLogEntry;
  });

const createJournalEntryResponse = openApiAuthProcedure
   .route({ method: "GET", tags: ["Journal Entries"] })
  .input(openapiResponseInputZod)
  .output(openapiJournalEntryCreateResponseOutputZod)
  .handler(async ({
    context: { team },
    input: { requestId }
  }) => {
    return await db.apiProductRequestLogs
      .selectAll()
      .find(requestId)
      .where({
        teamId: team.teamId,
        method: "POST",
      })
      .then(res => 
        openapiJournalEntryCreateResponseOutputZod.parse(res)
      );
  })

export const journalEntriesOpenApiRouter = {
  "create-request": createJournalEntryRequest,
  "create-response": createJournalEntryResponse
}