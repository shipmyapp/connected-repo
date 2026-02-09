import { API_PRODUCT_REQUEST_STATUS_ENUM, API_REQUEST_METHOD_ENUM, apiProductSkuEnum, PG_TBUS_TASK_STATUS_ENUM, TEAM_MEMBER_ROLE_ENUM, THEME_SETTING_ENUM, WEBHOOK_STATUS_ENUM } from "@connected-repo/zod-schemas/enums.zod";
import { createBaseTable } from "orchid-orm";
import { ulid } from "ulid";

export const BaseTable = createBaseTable({
  autoForeignKeys: false,
  nowSQL: `now() AT TIME ZONE 'UTC'`,
	snakeCase: true,

	columnTypes: (t) => ({
		...t,
    apiProductSkuEnum: () => t.enum("api_product_enum", apiProductSkuEnum),
    apiRequestMethodEnum: () => t.enum("api_request_method_enum", API_REQUEST_METHOD_ENUM),
    apiProductRequestStatusEnum: () => t.enum("api_status_enum", API_PRODUCT_REQUEST_STATUS_ENUM),
    teamMemberRoleEnum: () => t.enum("team_member_role_enum", TEAM_MEMBER_ROLE_ENUM),
    themeSettingEnum: () => t.enum("theme_setting_enum", THEME_SETTING_ENUM),
    timestampNumber: () => t.timestamp().asNumber(),
    ulid: () => t.string(26).default(() => ulid()),
    webhookStatusEnum: () => t.enum("webhook_status_enum", WEBHOOK_STATUS_ENUM),
    pgTbusTaskStatusEnum: () => t.enum("pg_tbus_task_status_enum", PG_TBUS_TASK_STATUS_ENUM),

		timestamps: () => ({
      createdAt: t.timestamps().createdAt.asNumber(),
      updatedAt: t.timestamps().updatedAt.asNumber(),
    }),
	}),
});

export const { sql } = BaseTable;