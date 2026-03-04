import { z } from "zod";

export const offlineErrorInsertZod = z.object({
  id: z.string(),
  timestamp: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  context: z.string(),
  userAgent: z.string(),
  deviceInfo: z.string(),
  appVersion: z.string(),
  clientId: z.string().optional(),
  teamId: z.string().optional(),
  userEmail: z.string().optional(),
});

export const batchInsertOfflineErrorsZod = z.array(offlineErrorInsertZod);

export type OfflineErrorInsert = z.infer<typeof offlineErrorInsertZod>;
export type BatchInsertOfflineErrors = z.infer<typeof batchInsertOfflineErrorsZod>;
