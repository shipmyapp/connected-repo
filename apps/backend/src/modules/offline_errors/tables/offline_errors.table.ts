import { BaseTable } from "@backend/db/base_table";

export class OfflineErrorsTable extends BaseTable {
  readonly table = 'offline_errors';

  columns = this.setColumns((t) => ({
    id: t.string().primaryKey(),
    timestamp: t.timestamp().default(t.sql`now()`),
    message: t.text(),
    stack: t.text().nullable(),
    context: t.string(),
    userAgent: t.string(),
    deviceInfo: t.string(),
    appVersion: t.string(),
    clientId: t.string().nullable(),
    teamId: t.string().nullable(),
    userEmail: t.string().nullable(),
    ...t.timestamps(),
  }));
}
