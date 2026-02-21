import { db } from "@backend/db/db"

export const getDeltaPrompts = async (
    cursorUpdatedAt: Date,
    cursorId: string | null,
    chunkSize: number,
) => {
    return db.prompts
        .includeDeleted()
        .select("*")
        .where({
            OR: [
                { updatedAt: { gte: cursorUpdatedAt } },
                ...(cursorId ? [{ updatedAt: cursorUpdatedAt, id: { gt: cursorId } }] : []),
            ],
        })
        .order({ updatedAt: "ASC", id: "ASC" })
        .limit(chunkSize);
}