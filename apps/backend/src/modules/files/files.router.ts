import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { fileCreateInputZod, fileSelectAllZod } from "@connected-repo/zod-schemas/file.zod";
import { z } from "zod";
import { syncMetadataZod } from "@connected-repo/zod-schemas/sync.zod";

const create = rpcProtectedProcedure
    .route({ method: "POST", tags: ["Files"] })
    .input(fileCreateInputZod)
    .output(fileSelectAllZod)
    .handler(async ({ input, context: { user } }) => {
        // We use selective .merge() here to ensure that as metadata (CDN URLs, thumbnails)
        // becomes available asynchronously on the frontend, it's synced/backed up 
        // to the backend even if the base record already exists.
        // Selective merge prevents overwriting immutable data like original filename or user ID.
        let newFile = await db.files.create({
            ...input,
            createdByUserId: user.id,
        }).onConflict("id").merge(['cdnUrl', 'thumbnailCdnUrl']);

        return newFile;
    });

const syncDelta = rpcProtectedProcedure
    .route({ method: "POST", tags: ["Files"] })
    .input(syncMetadataZod("files").optional())
    .output(z.object({
        data: z.array(fileSelectAllZod),
        syncMetadata: syncMetadataZod("files"),
    }))
    .handler(async ({ input, context: { user } }) => {
        const teamId = user.activeTeamAppId;
        if (!teamId || teamId !== input?.teamId) {
            throw new Error("Active Team Id is missing or mismatched");
        }

        const fromCursorId = input?.fromCursorId;
        const fromCursorUpdatedAt = input?.fromCursorUpdatedAt;
        const toCursorId = input?.toCursorId;
        const toCursorUpdatedAt = input?.toCursorUpdatedAt;
        const limit = 100;

        const baseQuery = db.files.where({ teamId });

        let query = baseQuery
            .order({ updatedAt: "DESC", id: "DESC" })
            .limit(limit);

        if (toCursorUpdatedAt) {
            // Fetch records NEWER than toCursor (delta sync / catch-up)
            const toDate = new Date(toCursorUpdatedAt);
            query = query.where({
                OR: [
                    { updatedAt: { gt: toDate } },
                    ...(toCursorId ? [{ updatedAt: toDate, id: { gt: toCursorId } }] : []),
                ],
            });
        } else if (fromCursorUpdatedAt) {
            // Fetch records OLDER than fromCursor (pagination / history sync)
            const fromDate = new Date(fromCursorUpdatedAt);
            query = query.where({
                OR: [
                    { updatedAt: { lt: fromDate } },
                    ...(fromCursorId ? [{ updatedAt: fromDate, id: { lt: fromCursorId } }] : []),
                ],
            });
        }

        const [data, totalCount] = await Promise.all([query.selectAll(), baseQuery.count()]);
        const syncMetadata = {
            teamId,
            syncedTable: "files",
            fromCursorId: data[0]?.id ?? null,
            fromCursorUpdatedAt: data[0]?.updatedAt ?? null,
            toCursorId: data[data.length - 1]?.id ?? null,
            toCursorUpdatedAt: data[data.length - 1]?.updatedAt ?? null,
            syncedAt: Date.now(),
            totalRecords: totalCount,
        }

        return { data, syncMetadata };
    });

export const filesRouter = {
    create,
    syncDelta,
};
