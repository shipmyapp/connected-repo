import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { fileCreateInputZod, fileSelectAllZod } from "@connected-repo/zod-schemas/file.zod";

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

export const filesRouter = {
    create,
};
