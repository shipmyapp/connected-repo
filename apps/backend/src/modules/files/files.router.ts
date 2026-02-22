import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { fileCreateInputZod } from "@connected-repo/zod-schemas/file.zod";

const create = rpcProtectedProcedure
    .input(fileCreateInputZod)
    .handler(async ({ input, context: { user } }) => {
        const newFile = await db.files.create({
            ...input,
            createdByUserId: user.id,
        });

        return newFile;
    });

export const filesRouter = {
    create,
};
