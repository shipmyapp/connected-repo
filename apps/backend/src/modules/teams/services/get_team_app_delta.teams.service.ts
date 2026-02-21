import { db } from "@backend/db/db";

export const getTeamAppDelta = async (
		userTeamsAppIds: string[],
		cursorUpdatedAt: Date,
		cursorId: string | null,
		chunkSize: number,
	) => {
		if (userTeamsAppIds.length === 0) return [];

		return db.teamsApp
			.includeDeleted()
			.where({ id: { in: userTeamsAppIds } })
			.where({
				OR: [
					{ updatedAt: { gte: cursorUpdatedAt } },
					...(cursorId ? [{ updatedAt: cursorUpdatedAt, id: { gt: cursorId } }] : []),
				],
			})
			.select("*")
			.order({ updatedAt: "ASC", id: "ASC" })
			.limit(chunkSize);
	}