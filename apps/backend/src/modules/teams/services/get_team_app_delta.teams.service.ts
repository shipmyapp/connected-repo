import { db } from "@backend/db/db";

export const getTeamAppDelta = async (
		userTeamsAppIds: string[],
		cursorUpdatedAt: Date,
		cursorId: string | null,
		chunkSize: number,
	) => {
		if (userTeamsAppIds.length === 0) return [];

		let query = db.teamsApp
			.includeDeleted()
			.where({ teamAppId: { in: userTeamsAppIds } })
			.select("*")
			.order({ updatedAt: "ASC", teamAppId: "ASC" })
			.limit(chunkSize);

		if (cursorId === null) {
			return await query.where({ updatedAt: { gte: cursorUpdatedAt } });
		} else {
			return await query.where({
				OR: [
					{ updatedAt: { gt: cursorUpdatedAt } },
					{ updatedAt: cursorUpdatedAt, teamAppId: { gt: cursorId } },
				],
			});
		}
	}