import { db } from "@backend/db/db";

export const getDeltaJournalEntries = async (
    userId: string,
    userOwnerAdminTeamAppIds: string[],
    cursorUpdatedAt: Date,
    cursorId: string | null,
    chunkSize: number,
) => {
    
    let query = db.journalEntries
        .includeDeleted()
        .where({
            OR: [
                { authorUserId: userId },
                ...(userOwnerAdminTeamAppIds.length > 0 ? [{ teamId: { in: userOwnerAdminTeamAppIds } }] : [])
            ]
        })
        .select("*")
        .order({ updatedAt: "ASC", journalEntryId: "ASC" })
        .limit(chunkSize)

    if (cursorId === null) {
			return await query.where({ updatedAt: { gte: cursorUpdatedAt } });
		} else {
			return await query.where({
				OR: [
					{ updatedAt: { gt: cursorUpdatedAt } },
					{ updatedAt: cursorUpdatedAt, journalEntryId: { gt: cursorId } },
				],
			});
		}
}