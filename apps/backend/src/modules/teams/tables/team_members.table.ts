import { BaseTable } from "@backend/db/base_table";
import { getRequestContext } from "@backend/lib/request-context";
import { UserTable } from "@backend/modules/users/tables/users.table";
import { TeamAppTable } from "./teams_app.table";

// Membership join between `users` and `teams_app`. A row may exist without a
// `userId` (invite pending — matched later by email or phoneNumber when the
// invitee signs up; see `UserTable.afterCreate`). Role gates most write
// paths. This table is scoped to the caller's active team by default — see
// `scopes.default` below — so any query outside a team-scoped RPC (e.g.
// `getMyTeams`) must call `.unscope("default")`.
export class TeamMemberTable extends BaseTable {
	readonly table = "team_members";

	columns = this.setColumns(
		(t) => ({
			id: t.ulidWithDefault().primaryKey(),
			teamId: t.ulid().foreignKey("teams_app", "id", {
				onUpdate: "RESTRICT",
				onDelete: "CASCADE",
			}),
			userId: t
				.uuid()
				.foreignKey("users", "id", {
					onUpdate: "RESTRICT",
					onDelete: "SET NULL",
				})
				.nullable(),
			email: t.string().nullable(),
			phoneNumber: t.string().nullable(),
			role: t.teamMemberRoleEnum(),
			addedAt: t.timestampNumber().default(t.sql`NOW()`),
			joinedAt: t.timestampNumber().nullable(),
			deletedAt: t.timestampNumber().nullable(),

			...t.timestamps(),
		}),
		// Soft-delete-aware uniques: "if a value is set on an active row, it
		// must be unique within the team." Partial on `deleted_at IS NULL` so
		// re-inviting a previously-removed member with the same email or
		// phone succeeds instead of hitting 23505 on the soft-deleted row.
		(t) => [
			t.unique(["teamId", "email"], {
				name: "team_members_team_id_email_idx",
				where: "deleted_at IS NULL",
			}),
			t.unique(["teamId", "phoneNumber"], {
				name: "team_members_team_id_phone_number_idx",
				where: "deleted_at IS NULL",
			}),
			t.unique(["teamId", "userId"], {
				name: "team_members_team_id_user_id_idx",
				where: "deleted_at IS NULL",
			}),
		],
	);

	// Default tenant scope. Returns unchanged query when no context exists
	// (auth bootstrap creates the first team_member before ALS is set).
	scopes = this.setScopes({
		default: (q) => {
			const ctx = getRequestContext();
			return ctx ? q.where({ teamId: ctx.tenantTeamId }) : q;
		},
	});

	// Disable soft delete during non-E2E tests to avoid SQL syntax errors when using onConflictDoNothing()
	readonly softDelete = true;

	relations = {
		team: this.belongsTo(() => TeamAppTable, {
			columns: ["teamId"],
			references: ["id"],
		}),
		user: this.belongsTo(() => UserTable, {
			columns: ["userId"],
			references: ["id"],
		}),
	};
}
