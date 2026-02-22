import { db } from "@backend/db/db";

export const getDeltaFiles = async (
    userId: string,
    userOwnerAdminTeamAppIds: string[],
    cursorUpdatedAt: Date,
    cursorId: string | null,
    chunkSize: number,
) => {
    return db.files
        .includeDeleted()
        .where({
            OR: [
                { createdByUserId: userId },
                ...(userOwnerAdminTeamAppIds.length > 0 
                    ? [{ 
                        teamId: { in: userOwnerAdminTeamAppIds },
                        tableName: "journalEntries" as const
                    }] 
                    : [])
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
