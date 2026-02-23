import { z } from "zod";
import { zTimeEpoch, zTimestamps } from "./zod_utils";
import { FILE_TABLE_NAME_ENUM, FILE_TYPE_ENUM } from "./enums.zod";

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
    teamId: z.uuid().nullable(),
    deletedAt: zTimeEpoch.nullable()
});

export const fileCreateInputZod = fileMandatoryZod
    .omit({ createdByUserId: true })
    .extend(fileOptionalZod.partial().shape);
export type FileCreateInput = z.infer<typeof fileCreateInputZod>;

export const fileSelectAllZod = fileMandatoryZod
    .extend(fileOptionalZod.shape)
    .extend(zTimestamps);
export type FileSelectAll = z.infer<typeof fileSelectAllZod>;