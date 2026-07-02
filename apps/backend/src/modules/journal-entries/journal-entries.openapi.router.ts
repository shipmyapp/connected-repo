import { db } from "@backend/db/db";
import { getRequestContext } from "@backend/lib/request-context";
import { incrementSubscriptionUsage } from "@backend/modules/subscriptions/services/increment_usage.subscriptions.service";
import { openApiAuthProcedure } from "@backend/procedures/open_api_auth.procedure";
import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import { createRequestLog } from "@backend/utils/create_request_log.utility";
import { checkSubscriptionAndUpdateLog } from "@backend/utils/subscription_check.utility";
import {
	apiProductRequestLogSelectAllZod,
	openapiResponseInputZod,
} from "@connected-repo/zod-schemas/api_product_request_log.zod";
import {
	openapiJournalEntryCreateInputZod,
	openapiJournalEntryCreateResponseOutputZod,
} from "@connected-repo/zod-schemas/journal_entry.zod";

const createJournalEntryRequest = openApiAuthProcedure
	.route({ method: "POST", tags: ["Journal Entries"] })
	.input(openapiJournalEntryCreateInputZod)
	.output(apiProductRequestLogSelectAllZod)
	.handler(async ({ context: { reqHeaders, teamApi }, input }) => {
		const logEntry = await createRequestLog(
			input,
			reqHeaders,
			"/api/v1/journal-entries/create-request",
			teamApi.teamApiId,
		);

		const { newLogEntry, subscription } = await checkSubscriptionAndUpdateLog(
			logEntry,
			"journal-entries",
			input.apiProductSku,
			teamApi.teamApiId,
			input.teamUserReferenceId,
		);

		if (!subscription) {
			return newLogEntry;
		}

		// Fire-and-forget: we don't await the transaction here to return the log entry immediately.
		// The actual entry creation and usage increment happen asynchronously.
		// Failures are captured to Sentry so they aren't silently swallowed as
		// floating promise rejections after the success response has been sent.
		//
		// `teamApi` (external API-key consumer) and `teams_app` (user workspace)
		// are independent tenancy models — see `teams_api.table.ts`. OpenAPI
		// requests don't run inside an active-team ALS scope, so
		// `getRequestContext()` is typically undefined here and the feature-flag
		// resolver falls back to the global `subscriptions.alert_webhook_enabled`
		// row. If a future code path invokes this handler from inside a
		// tenant-scoped ALS run, the tenant override is respected automatically.
		const tenantTeamId = getRequestContext()?.tenantTeamId ?? null;
		db.$transaction(async () => {
			const entry = await db.journalEntries
				.create(input.data)
				.onConflictDoNothing();
			if (entry) {
				await incrementSubscriptionUsage(
					subscription.subscriptionId,
					teamApi,
					tenantTeamId,
				);
			}
			return entry;
		}).catch((err) =>
			captureBackendException(err, {
				captureAll: true,
				tags: {
					handler: "journal-entries.create-request",
					phase: "fire-and-forget-transaction",
				},
				context: {
					backend: {
						teamApiId: teamApi.teamApiId,
						subscriptionId: subscription.subscriptionId,
						apiProductRequestId: newLogEntry.apiProductRequestId,
						apiProductSku: input.apiProductSku,
					},
				},
			}),
		);

		return newLogEntry;
	});

const createJournalEntryResponse = openApiAuthProcedure
	.route({ method: "GET", tags: ["Journal Entries"] })
	.input(openapiResponseInputZod)
	.output(openapiJournalEntryCreateResponseOutputZod)
	.handler(async ({ context: { teamApi }, input: { requestId } }) => {
		return await db.apiProductRequestLogs
			.selectAll()
			.find(requestId)
			.where({
				teamApiId: teamApi.teamApiId,
				method: "POST",
			})
			.then((res) => openapiJournalEntryCreateResponseOutputZod.parse(res));
	});

export const journalEntriesOpenApiRouter = {
	"create-request": createJournalEntryRequest,
	"create-response": createJournalEntryResponse,
};
