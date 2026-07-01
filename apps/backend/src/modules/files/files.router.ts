import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { fileTableNameZod } from "@connected-repo/zod-schemas/enums.zod";
import { fileCreateInputZod, fileSelectAllZod } from "@connected-repo/zod-schemas/file.zod";
import { z } from "zod";

const create = rpcProtectedProcedure
	.route({ method: "POST", tags: ["Files"] })
	.input(fileCreateInputZod)
	.output(fileSelectAllZod)
	.handler(async ({ input, context: { user } }) => {
		// Selective .merge() lets late-arriving cdnUrl/thumbnailCdnUrl land on an
		// existing row without overwriting immutable fields (filename, owner).
		const newFile = await db.files.create({
			...input,
			createdByUserId: user.id,
		}).onConflict("id").merge(['cdnUrl', 'thumbnailCdnUrl']);

		return newFile;
	});

const getByTableId = rpcProtectedProcedure
	.route({ method: "GET", tags: ["Files"] })
	.input(z.object({
		tableName: fileTableNameZod,
		tableId: z.string(),
	}))
	.output(z.array(fileSelectAllZod))
	.handler(async ({ input, context: { user } }) => {
		// Scoped to the requesting user. Production code with team-shared rows
		// should also widen this to include files where teamId is in the user's
		// active team membership.
		return await db.files
			.where({
				tableName: input.tableName,
				tableId: input.tableId,
				createdByUserId: user.id,
			})
			.order({ createdAt: "ASC" });
	});

export const filesRouter = {
	create,
	getByTableId,
};
