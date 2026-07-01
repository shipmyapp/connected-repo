import { getRequestContext } from "@backend/lib/request-context";
import { omitKeys } from "@backend/utils/omit.utils";
import {
	API_PRODUCT_REQUEST_STATUS_ENUM,
	API_REQUEST_METHOD_ENUM,
	apiProductSkuEnum,
	FILE_TABLE_NAME_ENUM,
	FILE_TYPE_ENUM,
	PG_TBUS_TASK_STATUS_ENUM,
	TEAM_MEMBER_ROLE_ENUM,
	THEME_SETTING_ENUM,
	WEBHOOK_STATUS_ENUM,
} from "@connected-repo/zod-schemas/enums.zod";
import { createBaseTable } from "orchid-orm";
import { ulid } from "ulid";

export const BaseTable = createBaseTable({
	autoForeignKeys: false,
	nowSQL: `clock_timestamp() AT TIME ZONE 'UTC'`,
	snakeCase: true,

	columnTypes: (t) => ({
		...t,
		// Decimal helpers — consistent precision across price/quantity/amount columns.
		percent: () => t.decimal(5, 2),
		price: () => t.decimal(10, 2),
		quantity: () => t.decimal(11, 3),
		amount: () => t.decimal(15, 2),

		apiProductSkuEnum: () => t.enum("api_product_enum", apiProductSkuEnum),
		apiRequestMethodEnum: () => t.enum("api_request_method_enum", API_REQUEST_METHOD_ENUM),
		apiProductRequestStatusEnum: () => t.enum("api_status_enum", API_PRODUCT_REQUEST_STATUS_ENUM),
		fileTableNameEnum: () => t.enum("file_table_name_enum", FILE_TABLE_NAME_ENUM),
		fileTypeEnum: () => t.enum("file_type_enum", FILE_TYPE_ENUM),
		pgTbusTaskStatusEnum: () => t.enum("pg_tbus_task_status_enum", PG_TBUS_TASK_STATUS_ENUM),
		teamMemberRoleEnum: () => t.enum("team_member_role_enum", TEAM_MEMBER_ROLE_ENUM),
		themeSettingEnum: () => t.enum("theme_setting_enum", THEME_SETTING_ENUM),
		timestampNumber: () => t.timestamp().asNumber(),
		ulid: () => t.string(26),
		ulidWithDefault: () => t.string(26).default(() => ulid()),
		webhookStatusEnum: () => t.enum("webhook_status_enum", WEBHOOK_STATUS_ENUM),

		timestamps: () => ({
			createdAt: t.timestamps().createdAt.asNumber(),
			updatedAt: t.timestamps().updatedAt.asNumber(),
		}),

		/**
		 * Standard column bundle for team-scoped domain tables. Stamps `teamId`
		 * and `createdByTeamMemberId` from the AsyncLocalStorage request
		 * context on every insert, making tenant-leak bugs impossible at the
		 * ORM layer. Use `omit` to drop fields per-table where needed.
		 *
		 * `editedByTeamMemberId` is intentionally NOT readOnly/setOnCreate —
		 * routes must spread the current actor onto every .update() payload.
		 * Hook-driven cascading writes need to re-stamp it; readOnly would
		 * reject the legitimate refresh.
		 */
		idAndAuditTimestamps: <
			OmitKeys extends
				| "id"
				| "teamId"
				| "clientCreatedAt"
				| "clientEditedAt"
				| "createdByTeamMemberId"
				| "editedByTeamMemberId"
				| "deletedAt"
				| "createdAt"
				| "updatedAt" = never,
		>(options?: {
			omit?: OmitKeys[];
		}) => {
			const allFields = {
				id: t.string(26).primaryKey(),
				teamId: t
					.string(26)
					.foreignKey("teams_app", "id", {
						onUpdate: "RESTRICT",
						onDelete: "CASCADE",
					})
					.readOnly()
					.setOnCreate(() => {
						const ctx = getRequestContext();
						if (!ctx) throw new Error("No request context — cannot set teamId");
						return ctx.tenantTeamId;
					}),
				clientCreatedAt: t.timestamp().asNumber(),
				clientEditedAt: t.timestamp().nullable().asNumber(),
				createdByTeamMemberId: t
					.string(26)
					.readOnly()
					.foreignKey("team_members", "id", {
						onUpdate: "RESTRICT",
						onDelete: "SET NULL",
					})
					.setOnCreate(() => {
						const ctx = getRequestContext();
						if (!ctx) throw new Error("No request context — cannot set createdByTeamMemberId");
						return ctx.teamMemberId;
					}),
				editedByTeamMemberId: t.string(26).nullable().foreignKey("team_members", "id", {
					onUpdate: "RESTRICT",
					onDelete: "SET NULL",
				}),
				deletedAt: t.timestamp().asNumber().nullable(),
				createdAt: t.timestamps().createdAt.asNumber(),
				updatedAt: t.timestamps().updatedAt.asNumber(),
			};

			return (options?.omit ? omitKeys(allFields, options.omit) : allFields) as Omit<
				typeof allFields,
				OmitKeys
			>;
		},
	}),
});

export const { sql } = BaseTable;
