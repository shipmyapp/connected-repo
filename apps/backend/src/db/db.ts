import { dbConfig } from "@backend/db/config.db";
import { AccountTable } from "@backend/modules/auth/tables/account.auth.table";
import {
	OAuthAccessTokenTable,
	OAuthClientTable,
	OAuthConsentTable,
	OAuthRefreshTokenTable,
} from "@backend/modules/auth/tables/oauth.auth.tables";
import { SessionTable } from "@backend/modules/auth/tables/session.auth.table";
import { VerificationTable } from "@backend/modules/auth/tables/verification.auth.table";
import { DeviceTable } from "@backend/modules/devices/tables/devices.table";
import { PgTbusTaskLogTable } from "@backend/modules/events/tables/pg_tbus_task_log.table";
import { FileTable } from "@backend/modules/files/tables/files.table";
import { JournalEntryTable } from "@backend/modules/journal-entries/tables/journal_entries.table";
import { ApiProductRequestLogsTable } from "@backend/modules/logs/tables/api_product_request_logs.table";
import { PushDeviceTable } from "@backend/modules/notifications/tables/push_devices.table";
import { PromptsTable } from "@backend/modules/prompts/tables/prompts.table";
import { SubscriptionsTable } from "@backend/modules/subscriptions/tables/subscriptions.table";
import { FeatureFlagTable } from "@backend/modules/system/tables/feature_flags.table";
import { OperatorAuditLogTable } from "@backend/modules/system/tables/operator_audit_log.table";
import { RateLimitTable } from "@backend/modules/system/tables/rate_limits.table";
import { TeamMemberTable } from "@backend/modules/teams/tables/team_members.table";
import { TeamApiTable } from "@backend/modules/teams/tables/teams_api.table";
import { TeamAppTable } from "@backend/modules/teams/tables/teams_app.table";
import { ConnectedAppActionTable } from "@backend/modules/user_mcp/tables/connected_app_actions.table";
import { UserTable } from "@backend/modules/users/tables/users.table";
import { orchidORM } from "orchid-orm/node-postgres";

export const db = orchidORM(
	{
		...dbConfig,
		log: false,
	},
	{
		users: UserTable,
		journalEntries: JournalEntryTable,
		prompts: PromptsTable,
		teamsApp: TeamAppTable,
		teamMembers: TeamMemberTable,
		files: FileTable,

		// API only
		teamsApi: TeamApiTable,
		subscriptions: SubscriptionsTable,
		apiProductRequestLogs: ApiProductRequestLogsTable,

		// Backend only
		sessions: SessionTable,
		accounts: AccountTable,
		verifications: VerificationTable,
		pgTbusTaskLogs: PgTbusTaskLogTable,
		featureFlags: FeatureFlagTable,
		operatorAuditLog: OperatorAuditLogTable,
		// Unused since rate limits moved to Redis; dropped in a later release.
		rateLimits: RateLimitTable,
		// Kept, read and written by nothing, until the next release drops it (expand/contract).
		pushDevices: PushDeviceTable,
		// One row per device, per account: installs, push address and permissions.
		devices: DeviceTable,
		// Connected apps (ADR-045)
		oauthClients: OAuthClientTable,
		oauthAccessTokens: OAuthAccessTokenTable,
		oauthRefreshTokens: OAuthRefreshTokenTable,
		oauthConsents: OAuthConsentTable,
		connectedAppActions: ConnectedAppActionTable,
	},
);

export type Db = typeof db;
