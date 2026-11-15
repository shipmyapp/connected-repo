import { z } from "zod";
import { FILE_TABLE_NAME_ENUM, FILE_TYPE_ENUM } from "./enums.zod.js";
import { zString, zTimeEpoch, zTimestamps } from "./zod_utils.js";

export const fileMandatoryZod = z.object({
	id: z.ulid(),
	tableName: z.enum(FILE_TABLE_NAME_ENUM),
	tableId: z.union([z.ulid(), z.uuid()]),
	type: z.enum(FILE_TYPE_ENUM),
	// Bounded to prevent malicious clients from inflating storage / sync
	// payload with multi-MB strings that would be echoed to every device.
	fileName: zString.min(1).max(255),
	// RFC 6838 media type: `type/subtype`. Regex-checked so downstream
	// `startsWith`/allowlist logic (e.g. `image/*`) stays sound.
	mimeType: zString
		.min(1)
		.max(127)
		.regex(/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/),
	createdByUserId: z.uuid(),
});

export const fileOptionalZod = z.object({
	cdnUrl: z.url().nullable(),
	thumbnailCdnUrl: z.url().nullable(),
	deletedAt: zTimeEpoch.nullable(),
	isMainFileLost: z.boolean().default(false),
});

// `teamId` is a server-owned tenant scope — it is set from `activeTeamId`
// on the request context, never accepted from the client, to prevent
// tenant-forgery via a spread-in field.
export const fileServerOwnedZod = z.object({
	teamId: z.ulid().nullable(),
});

export const fileCreateInputZod = fileMandatoryZod
	.omit({ createdByUserId: true })
	.extend(fileOptionalZod.partial().shape);
export type FileCreateInput = z.infer<typeof fileCreateInputZod>;

export const fileSelectAllZod = fileMandatoryZod
	.extend(fileOptionalZod.shape)
	.extend(fileServerOwnedZod.shape)
	.extend(zTimestamps);
export type FileSelectAll = z.infer<typeof fileSelectAllZod>;
