import { db } from "@backend/db/db";

export const getDeltaJournalEntries = async (
    userId: string,
    userOwnerAdminTeamAppIds: string[],
    cursorUpdatedAt: Date,
    cursorId: string | null,
    chunkSize: number,
) => {
    return db.journalEntries
        .includeDeleted()
        .where({
            OR: [
                { authorUserId: userId },
                ...(userOwnerAdminTeamAppIds.length > 0 ? [{ teamId: { in: userOwnerAdminTeamAppIds } }] : [])
            ]
        })
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