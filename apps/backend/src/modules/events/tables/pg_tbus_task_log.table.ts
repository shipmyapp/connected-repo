import { BaseTable } from "@backend/db/base_table";

/**
 * Audit log table for pg-tbus tasks and events.
 * Tracks execution history, success/failure, and provides queryable history.
 */
export class PgTbusTaskLogTable extends BaseTable {
  readonly table = "pg_tbus_task_log";

  columns = this.setColumns(
    (t) => ({
      pgTbusTaskLogId: t.ulid().primaryKey(),

      // pg-tbus correlation
      tbusTaskId: t.uuid().nullable(), // pg-tbus internal task ID
      taskName: t.string(), // e.g., "subscription.alert_webhook"
      queueName: t.string().nullable(), // Queue this task belongs to

      // Task payload summary (for querying)
      entityType: t.string().nullable(), // e.g., "subscription", "user"
      entityId: t.string().nullable(), // e.g., subscriptionId, userId
      teamApiId: t.uuid().nullable(), // For team-scoped tasks

      // Execution tracking
      status: t.pgTbusTaskStatusEnum(),
      attemptNumber: t.integer().default(0), // Which retry attempt this was

      // Timing
      scheduledAt: t.timestampNumber().nullable(), // When task was scheduled
      startedAt: t.timestampNumber().nullable(), // When execution started
      completedAt: t.timestampNumber().nullable(), // When execution finished

      // Result details
      success: t.boolean().nullable(), // true/false/null for pending
      errorMessage: t.text().nullable(), // Error details if failed
      errorCode: t.string().nullable(), // Categorized error code
      responseStatusCode: t.integer().nullable(), // HTTP status for webhooks

      // Full payload and response (JSON for flexibility)
      payload: t.json<Record<string, unknown>>().nullable(), // Task input data
      response: t.json<Record<string, unknown>>().nullable(), // Task output/response

      // Retry information from pg-tbus
      retryLimit: t.integer().nullable(), // Max retries allowed
      willRetry: t.boolean().nullable(), // Will pg-tbus retry this?

      ...t.timestamps(),
    }),
    (t) => [
      t.index(["taskName", "status"]), // Query by task type and status
      t.index(["entityType", "entityId"]), // Query by entity
      t.index(["teamApiId", "createdAt"]), // Query team history
      t.index(["tbusTaskId"]), // Correlation with pg-tbus
      t.index(["status", "createdAt"]), // Recent failures/successes
    ]
  );
}
