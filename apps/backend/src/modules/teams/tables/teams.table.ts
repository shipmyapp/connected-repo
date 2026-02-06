import { BaseTable } from "@backend/db/base_table";
import { ApiProductSku } from "@connected-repo/zod-schemas/enums.zod";

export class TeamTable extends BaseTable {
  readonly table = "teams";

  columns = this.setColumns((t) => ({
    teamId: t.uuid().primaryKey().default(t.sql`gen_random_uuid()`),

    allowApiSubsCreationForSkus: t.array(t.string().narrowType((t) => t<ApiProductSku>())).default([]),
    allowedDomains: t.array(t.string()),
    allowedIPs: t.array(t.string()),
    apiSecretHash: t.string().select(false),
    name: t.string(),
    rateLimitPerMinute: t.integer(),
    subscriptionAlertWebhookUrl: t.string().nullable(),
    subscriptionAlertWebhookBearerToken: t.string().nullable().select(false),
    ...t.timestamps(),
  }));
}
