import { db } from "@backend/db/db";

export const getDeltaJournalEntries = async (
    userId: string,
    userOwnerAdminTeamAppIds: string[],
    cursorUpdatedAt: Date,
    cursorId: string | null,
    chunkSize: number,
) => {
    
    const visibilityWhere: any = {
        OR: [{ capturedByUserId: userId }],
    };
    if (userOwnerAdminTeamAppIds.length > 0) {
        visibilityWhere.OR.push({ teamId: { in: userOwnerAdminTeamAppIds } });
    }

    let query = db.journalEntries
        .includeDeleted()
        .where(visibilityWhere)
        .select("*")
        .order({ updatedAt: "ASC", journalEntryId: "ASC" })
        .limit(chunkSize)

    if (cursorId === null) {
			return query.where({ updatedAt: { gte: cursorUpdatedAt } });
		} else {
			return query.where({
				OR: [
					{ updatedAt: { gt: cursorUpdatedAt } },
					{ updatedAt: cursorUpdatedAt, journalEntryId: { gt: cursorId } },
				],
			});
		}
}   