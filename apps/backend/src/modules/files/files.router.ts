import { db } from "@backend/db/db";
import { rpcProtectedActiveTeamProcedure } from "@backend/procedures/protected.procedure";
import { fileTableNameZod } from "@connected-repo/zod-schemas/enums.zod";
import { fileCreateInputZod, fileSelectAllZod } from "@connected-repo/zod-schemas/file.zod";
import {
	filePullBundlesInputZod,
	filePullBundlesOutputZod,
	filePushCdnUpdatesInputZod,
	filePushCdnUpdatesOutputZod,
} from "@connected-repo/zod-schemas/files/sync";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { pullFilesService, pushFilesCdnUpdatesService } from "./services/sync.files.service";

const create = rpcProtectedActiveTeamProcedure
	.route({ method: "POST", tags: ["Files"] })
	.input(fileCreateInputZod)
	.output(fileSelectAllZod)
	.handler(async ({ input, context: { user, activeTeamId } }) => {
		// Insert-or-nothing. The old upsert (`ON CONFLICT (id) DO UPDATE`) had no
		// tenant condition: a caller who knew any file id rewrote that row and
		// read it back. URLs are set only by `pushCdnUpdates`. `teamId` is
		// server-owned, from `activeTeamId`, never from the client input.
		await db.files
			.create({
				...input,
				teamId: activeTeamId,
				createdByUserId: user.id,
			})
			.onConflictDoNothing("id");
		// The tenant scope hides another team's row; another member's row in
		// this team is refused below.
		const row = await db.files.findOptional(input.id);
		if (!row || row.createdByUserId !== user.id) {
			throw new ORPCError("CONFLICT", {
				status: 409,
				message: "A file with this id already exists.",
			});
		}
		return row;
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
