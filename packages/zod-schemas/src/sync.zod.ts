import { z } from "zod";
import { zTimeEpoch } from "./zod_utils";

export const syncMetadataZod = (tableName: string) => z.object({
  teamId: z.ulid(),
  syncedTable: z.literal(tableName),
  fromCursorId: z.string().nullable(),
  fromCursorUpdatedAt: zTimeEpoch.nullable(),
  toCursorId: z.string().nullable(),
  toCursorUpdatedAt: zTimeEpoch.nullable(),
  syncedAt: zTimeEpoch.nullable(),
  totalRecords: z.number(),
});

export type SyncMetadata = z.infer<ReturnType<typeof syncMetadataZod>>;
