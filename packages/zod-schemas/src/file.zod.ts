import { z } from "zod";
import { FILE_TABLE_NAME_ENUM, FILE_TYPE_ENUM } from "./enums.zod";
import { zTimeEpoch, zTimestamps } from "./zod_utils";

export const fileMandatoryZod = z.object({
    id: z.ulid(),
    tableName: z.enum(FILE_TABLE_NAME_ENUM),
    tableId: z.union([z.ulid(), z.uuid()]),
    type: z.enum(FILE_TYPE_ENUM),
    fileName: z.string(),
    mimeType: z.string(),
    createdByUserId: z.uuid(),
});

export const fileOptionalZod = z.object({
    cdnUrl: z.url().nullable(),
    thumbnailCdnUrl: z.url().nullable(),
    teamId: z.ulid().nullable(),
    deletedAt: zTimeEpoch.nullable(),
    isMainFileLost: z.boolean().default(false),
});

export const fileCreateInputZod = fileMandatoryZod
    .omit({ createdByUserId: true })
    .extend(fileOptionalZod.partial().shape);
export type FileCreateInput = z.infer<typeof fileCreateInputZod>;

export const fileSelectAllZod = fileMandatoryZod
    .extend(fileOptionalZod.shape)
    .extend(zTimestamps);
export type FileSelectAll = z.infer<typeof fileSelectAllZod>;