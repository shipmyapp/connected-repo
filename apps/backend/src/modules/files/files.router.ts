import { db } from "@backend/db/db";
import { rpcProtectedActiveTeamProcedure } from "@backend/procedures/protected.procedure";
import { fileTableNameZod } from "@connected-repo/zod-schemas/enums.zod";
import {
	fileCreateInputZod,
	fileSelectAllZod,
} from "@connected-repo/zod-schemas/file.zod";
import {
	filePullBundlesInputZod,
	filePullBundlesOutputZod,
	filePushCdnUpdatesInputZod,
	filePushCdnUpdatesOutputZod,
} from "@connected-repo/zod-schemas/files/sync";
import { z } from "zod";
import {
	pullFilesService,
	pushFilesCdnUpdatesService,
} from "./services/sync.files.service";

const create = rpcProtectedActiveTeamProcedure
	.route({ method: "POST", tags: ["Files"] })
	.input(fileCreateInputZod)
	.output(fileSelectAllZod)
	.handler(async ({ input, context: { user, activeTeamId } }) => {
		// Selective .merge() lets late-arriving cdnUrl/thumbnailCdnUrl land on an
		// existing row without overwriting immutable fields (filename, owner).
		//
		// `teamId` is server-owned — pulled from `activeTeamId` on the auth
		// context, NEVER from the client input, to prevent tenant-forgery.
		const newFile = await db.files
			.create({
				...input,
				teamId: activeTeamId,
				createdByUserId: user.id,
			})
			.onConflict("id")
			.merge(["cdnUrl", "thumbnailCdnUrl"]);

		return newFile;
	});

const getByTableId = rpcProtectedActiveTeamProcedure
	.route({ method: "GET", tags: ["Files"] })
	.input(
		z.object({
			tableName: fileTableNameZod,
			tableId: z.string(),
		}),
	)
	.output(z.array(fileSelectAllZod))
	.handler(async ({ input, context: { user, activeTeamId } }) => {
		return await db.files
			.where({
				tableName: input.tableName,
				tableId: input.tableId,
				createdByUserId: user.id,
				teamId: activeTeamId,
			})
			.order({ createdAt: "ASC" });
	});

const pushCdnUpdates = rpcProtectedActiveTeamProcedure
	.route({ method: "POST", tags: ["Files"] })
	.input(filePushCdnUpdatesInputZod)
	.output(filePushCdnUpdatesOutputZod)
	.handler(async ({ input }) => {
		return await pushFilesCdnUpdatesService(input);
	});

const pullBundles = rpcProtectedActiveTeamProcedure
	.route({ method: "POST", tags: ["Files"] })
	.input(filePullBundlesInputZod)
	.output(filePullBundlesOutputZod)
	.handler(async ({ input }) => {
		return await pullFilesService(input);
	});

export const filesRouter = {
	create,
	getByTableId,
	pushCdnUpdates,
	pullBundles,
};
