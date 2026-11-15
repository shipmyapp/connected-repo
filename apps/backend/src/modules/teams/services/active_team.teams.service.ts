import { db } from "@backend/db/db";

/**
 * Points every account whose active team is one of `teamIds` at its own live
 * personal team (null when it has none: `teams.getDefaultTeam` mints one on
 * the next load). Needed before a team is deleted (users.active_team_app_id is
 * ON DELETE RESTRICT) and when a team is soft-deleted (the gate would
 * otherwise refuse every call of those members).
 */
export async function moveUsersOffTeams(teamIds: readonly string[]): Promise<number> {
	if (teamIds.length === 0) return 0;
	const ids = [...teamIds];
	const result = await db.$query`
		UPDATE users u
		SET active_team_app_id = (
				SELECT p.id FROM teams_app p
				WHERE p.personal_team_for_user_id = u.id
					AND p.deleted_at IS NULL
					AND NOT (p.id = ANY(${ids}::varchar[]))
				ORDER BY p.created_at
				LIMIT 1
			),
			updated_at = now()
		WHERE u.active_team_app_id = ANY(${ids}::varchar[])
	`;
	return result.rowCount ?? 0;
}

/** The caller's live personal team id, or null. */
export async function personalTeamIdOf(userId: string): Promise<string | null> {
	const team = await db.teamsApp
		.where({ personalTeamForUserId: userId })
		.select("id")
		.takeOptional();
	return team?.id ?? null;
}
