import { dbConfig } from "@backend/db/config.db";
import { AccountTable } from "@backend/modules/auth/tables/account.auth.table";
import { SessionTable } from "@backend/modules/auth/tables/session.auth.table";
import { VerificationTable } from "@backend/modules/auth/tables/verification.auth.table";
import { PgTbusTaskLogTable } from "@backend/modules/events/tables/pg_tbus_task_log.table";
import { JournalEntryTable } from "@backend/modules/journal-entries/tables/journal_entries.table";
import { ApiProductRequestLogsTable } from "@backend/modules/logs/tables/api_product_request_logs.table";
import { PromptsTable } from "@backend/modules/prompts/tables/prompts.table";
import { SubscriptionsTable } from "@backend/modules/subscriptions/tables/subscriptions.table";
import { TeamTable } from "@backend/modules/teams/tables/teams.table";
import { UserTable } from "@backend/modules/users/tables/users.table";
import { orchidORM } from "orchid-orm/node-postgres";

// Phase 0 Complete: All database tables registered
export const db = orchidORM(
	{
		...dbConfig,
		log: false,
	},
	{
		users: UserTable,
		journalEntries: JournalEntryTable,
		prompts: PromptsTable,
		sessions: SessionTable,
		accounts: AccountTable,
		verifications: VerificationTable,
		subscriptions: SubscriptionsTable,
		teams: TeamTable,
		apiProductRequestLogs: ApiProductRequestLogsTable,
		pgTbusTaskLogs: PgTbusTaskLogTable,
	},
);

export type Db = typeof db;
