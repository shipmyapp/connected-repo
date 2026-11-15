import { change } from "../db_script";

// The team member an API key writes journal entries as (expand only).
change(async (db) => {
	await db.changeTable("teams_api", (t) => ({
		writesAsTeamMemberId: t.add(
			t
				.string(26)
				.foreignKey("team_members", "id", { onDelete: "SET NULL", onUpdate: "RESTRICT" })
				.nullable(),
		),
	}));
});
