import { db } from "@backend/db/db"

export const getDeltaPrompts = async (
    cursorUpdatedAt: Date,
    cursorId: number | null,
    chunkSize: number,
) => {
    const query = db.prompts
        .includeDeleted()
        .select("*")
        .order({ updatedAt: "ASC", promptId: "ASC" })
        .limit(chunkSize)

    if (cursorId === null) {
        return query.where({ updatedAt: { gte: cursorUpdatedAt } });
    } else {
        return query.where({
            OR: [
                { updatedAt: { gt: cursorUpdatedAt } },
                { updatedAt: cursorUpdatedAt, promptId: { gt: cursorId } },
            ],
        });
    }
}