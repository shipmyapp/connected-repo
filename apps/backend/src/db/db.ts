import { dbConfig } from "@backend/db/config.db";
import { AccountTable } from "@backend/modules/auth/tables/account.auth.table";
import { SessionTable } from "@backend/modules/auth/tables/session.auth.table";
import { VerificationTable } from "@backend/modules/auth/tables/verification.auth.table";
import { PgTbusTaskLogTable } from "@backend/modules/events/tables/pg_tbus_task_log.table";
import { LeadTable } from "@backend/modules/leads/tables/leads.table";
import { ApiProductRequestLogTable } from "@backend/modules/logs/tables/api_product_request_logs.table";
import { SubscriptionTable } from "@backend/modules/subscriptions/tables/subscriptions.table";
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
		leads: LeadTable,
		sessions: SessionTable,
		accounts: AccountTable,
		verifications: VerificationTable,
		subscriptions: SubscriptionTable,
		teams: TeamTable,
		apiProductRequestLogs: ApiProductRequestLogTable,
		pgTbusTaskLogs: PgTbusTaskLogTable,
	},
);

export type Db = typeof db;
