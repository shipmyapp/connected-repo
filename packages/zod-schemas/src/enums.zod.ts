import { z } from "zod";

export const API_PRODUCT_REQUEST_STATUS_ENUM = ["AI Error", "Invalid API route", "No active subscription", "Requests exhausted", "Pending", "Server Error", "Success"] as const;
export const apiProductRequestStatusZod = z.enum(API_PRODUCT_REQUEST_STATUS_ENUM);
export type ApiProductRequestStaus = z.infer<typeof apiProductRequestStatusZod>;

export const API_PRODUCTS = [
  {
    apiRoute: "journal-entries",
    name: "Save Journal Entry",
    sku: "journal_entry_create",
    unitSize: 100,
    validityDays: 30,
  }
]as const;
export const apiProductSkuEnum = API_PRODUCTS.map(product => product.sku) as ["journal_entry_create"];
export const apiProductSkuZod = z.enum(apiProductSkuEnum);
export type ApiProductSku = z.infer<typeof apiProductSkuZod>;

export const API_REQUEST_METHOD_ENUM = ["GET", "POST", "PUT", "DELETE"] as const;
export const apiRequestMethodZod = z.enum(API_REQUEST_METHOD_ENUM);
export type ApiRequestMethod = z.infer<typeof apiRequestMethodZod>;

export const TEAM_MEMBER_ROLE_ENUM = ["Owner", "Admin", "Member"] as const;
export const teamMemberRoleZod = z.enum(TEAM_MEMBER_ROLE_ENUM);
export type TeamMemberRole = z.infer<typeof teamMemberRoleZod>;

export const THEME_SETTING_ENUM = ["dark", "light", "system"] as const;
export const themeSettingZod = z.enum(THEME_SETTING_ENUM);
export type ThemeSetting = z.infer<typeof themeSettingZod>;

export const WEBHOOK_STATUS_ENUM = ["Pending", "Sent", "Failed"] as const;
export const webhookStatusZod = z.enum(WEBHOOK_STATUS_ENUM);
export type WebhookStatus = z.infer<typeof webhookStatusZod>;

export const PG_TBUS_TASK_STATUS_ENUM = ["pending", "active", "completed", "failed", "cancelled"] as const;
export const pgTbusTaskStatusZod = z.enum(PG_TBUS_TASK_STATUS_ENUM);
export type PgTbusTaskStatus = z.infer<typeof pgTbusTaskStatusZod>;

export const TABLES_TO_SYNC_ENUM = ["journalEntries", "prompts", "teamsApp", "teamMembers"] as const;
export const tablesToSyncZod = z.enum(TABLES_TO_SYNC_ENUM);
export type TablesToSync = z.infer<typeof tablesToSyncZod>;
