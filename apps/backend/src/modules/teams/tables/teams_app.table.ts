import { BaseTable } from "@backend/db/base_table";
import { TeamMemberTable } from "./team_members.table";

// `teams_app` is the primary user-team / workspace table. Every user has
// exactly one personal team (rows where `personalTeamForUserId = user.id`)
// created on signup by `UserTable.afterCreate`, and may belong to any number
// of shared teams. `users.activeTeamAppId` always points at one of these rows
// and is what the `x-team-id` header on every RPC must match (see
// `rpcProtectedActiveTeamProcedure`).
//
// This is unrelated to `teams_api` — that table models external API-key
// consumers (rate limits, IP allowlists, secret hashes) and shares only the
// `x-team-id` header name at the transport layer.
export class TeamAppTable extends BaseTable {
	readonly table = "teams_app";

	columns = this.setColumns(
		(t) => ({
			id: t.ulidWithDefault().primaryKey(),
			name: t.string(),
			logoUrl: t.string().nullable(),
			createdByUserId: t.uuid().foreignKey("users", "id", {
				onDelete: "CASCADE",
				onUpdate: "RESTRICT",
			}),
			// Non-null for personal teams, null for shared. Partial unique
			// below enforces at most one personal team per user among active
			// (non-soft-deleted) rows. FK CASCADE means a personal team is
			// destroyed with its owner; shared teams (this column null) are
			// untouched.
			personalTeamForUserId: t
				.uuid()
				.foreignKey("users", "id", {
					onDelete: "CASCADE",
					onUpdate: "RESTRICT",
				})
				.nullable(),
			deletedAt: t.timestampNumber().nullable(),

			...t.timestamps(),
		}),
		(t) => [
			t.unique(["personalTeamForUserId"], {
				name: "teams_app_personal_team_for_user_id_idx",
				where:
					"deleted_at IS NULL AND personal_team_for_user_id IS NOT NULL",
			}),
		],
	);

	// Disable soft delete during non-E2E tests to avoid SQL syntax errors when using onConflictDoNothing()
	readonly softDelete = true;

	relations = {
		members: this.hasMany(() => TeamMemberTable, {
			columns: ["id"],
			references: ["teamId"],
		}),
	};
}
