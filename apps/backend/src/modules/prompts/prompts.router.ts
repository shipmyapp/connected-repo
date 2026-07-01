import { db } from "@backend/db/db";
import { syncDeltaService } from "@backend/modules/sync/services/sync_delta.sync.service";
import {
	rpcProtectedActiveTeamProcedure,
	rpcProtectedProcedure,
} from "@backend/procedures/protected.procedure";
import { rpcPublicProcedure } from "@backend/procedures/public.procedure";
import {
	type PromptSelectAll,
	promptGetByCategoryZod,
	promptGetByIdZod,
	promptSelectAllZod,
} from "@connected-repo/zod-schemas/prompt.zod";
import {
	promptsPullBundlesInputZod,
	promptsPullBundlesOutputZod,
} from "@connected-repo/zod-schemas/prompts/sync";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

// Get all active prompts, optionally filtered by team
const getAllActive = rpcProtectedProcedure
	.output(z.array(promptSelectAllZod))
	.handler(async () => {
		const query: any = { deletedAt: null };

		const prompts = await db.prompts
			.select("*")
			.where(query)
			.order({ createdAt: "DESC" });

		return prompts;
	});

// Get a random active prompt, optionally filtered by team
const getRandomActive = rpcProtectedProcedure
	.output(promptSelectAllZod)
	.handler(async () => {
		const query: any = { deletedAt: null };

		// Get count of active prompts for this scope
		const count = await db.prompts.where(query).count();
		if (count === 0) {
			throw new ORPCError("NOT_FOUND", {
				status: 404,
				message: `No active prompts available for the selected workspace.`,
			});
		}

		// Generate random offset
		const randomIndex = Math.floor(Math.random() * count);

		// Get the prompt at this offset
		const prompt = await db.prompts
			.where(query)
			.select("*")
			.offset(randomIndex)
			.limit(1)
			.take();

		if (prompt) {
			return prompt;
		}

		throw new ORPCError("NOT_FOUND", {
			status: 404,
			message: "Failed to retrieve a random active prompt",
		});
	});

// Get prompt by ID
const getById = rpcPublicProcedure
	.input(promptGetByIdZod)
	.output(promptSelectAllZod)
	.handler(async ({ input: { id } }) => {
		const prompt = await db.prompts.find(id);

		if (!prompt) {
			throw new ORPCError("NOT_FOUND", {
				status: 404,
				message: "Prompt not found",
			});
		}

		return prompt;
	});

// Get prompts by category, optionally filtered by team
const getByCategory = rpcProtectedProcedure
	.input(promptGetByCategoryZod)
	.output(z.array(promptSelectAllZod))
	.handler(async ({ input: { category } }) => {
		const query: any = { category, deletedAt: null };

		const prompts = await db.prompts
			.where(query)
			.select("*")
			.order({ createdAt: "DESC" });

		return prompts;
	});

// ─── Sync ───────────────────────────────────────────────────────────────
//
// Prompts are a global (untenanted) table. Filtered only by the wave-1
// snapshot ceiling.
const pullBundles = rpcProtectedActiveTeamProcedure
	.route({ method: "POST", tags: ["Prompts"] })
	.input(promptsPullBundlesInputZod)
	.output(promptsPullBundlesOutputZod)
	.handler(async ({ input }) => {
		const { data, syncMetadata } = await syncDeltaService<PromptSelectAll>({
			// biome-ignore lint/suspicious/noExplicitAny: __scopes generic mismatch when passing bare table query
			baseQuery: db.prompts as any,
			syncMetadataInput: input.syncMetadata,
			topLevelSyncedAt: input.topLevelSyncedAt,
			syncedTable: "prompts",
		});
		return { rows: data, syncMetadata };
	});

export const promptsRouter = {
	getAllActive,
	getRandomActive,
	getById,
	getByCategory,
	pullBundles,
};
