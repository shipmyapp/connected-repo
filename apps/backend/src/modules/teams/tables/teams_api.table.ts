import { BaseTable } from "@backend/db/base_table";
import type { ApiProductSku } from "@connected-repo/zod-schemas/enums.zod";

// `teams_api` models external API-key consumers (SKU allowlists, IP/domain
// whitelists, rate limits, webhook config). It is intentionally NOT a child
// of `teams_app` — API tenants and user workspaces are two independent
// tenancy models that happen to share the `x-team-id` header name at the
// transport layer. The api-key middleware resolves `x-team-id` to a
// `teams_api.teamApiId`; the RPC active-team middleware resolves it to a
// `teams_app.id`. Different handlers, no ambiguity.
export class TeamApiTable extends BaseTable {
	readonly table = "teams_api";

	columns = this.setColumns((t) => ({
		teamApiId: t.ulidWithDefault().primaryKey(),

		allowApiSubsCreationForSkus: t
			.array(t.string().narrowType((t) => t<ApiProductSku>()))
			.default([]),
		allowedDomains: t.array(t.string()),
		allowedIPs: t.array(t.string()),
		apiSecretHash: t.string().select(false),
		name: t.string(),
		rateLimitPerMinute: t.integer(),
		subscriptionAlertWebhookUrl: t.string().nullable(),
		subscriptionAlertWebhookBearerToken: t.string().nullable().select(false),
		...t.timestampsAsNumbers(),
	}));
}
