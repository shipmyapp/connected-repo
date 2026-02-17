import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { rpcPublicProcedure } from "@backend/procedures/public.procedure";
import { z } from "zod";
import {
	promptGetByCategoryZod,
	promptGetByIdZod,
} from "@connected-repo/zod-schemas/prompt.zod";
import { ORPCError } from "@orpc/server";

// Get all active prompts, optionally filtered by team
const getAllActive = rpcProtectedProcedure
	.input(z.object({ teamId: z.uuid().nullable().optional() }))
	.handler(async ({ input: { teamId } }) => {
		const query: any = { deletedAt: null };
		if (teamId !== undefined) {
			query.teamId = teamId;
		}

		const prompts = await db.prompts
			.select("*")
			.where(query)
			.order({ createdAt: "DESC" });

		return prompts;
	});

// Get a random active prompt, optionally filtered by team
const getRandomActive = rpcProtectedProcedure
	.input(z.object({ teamId: z.uuid().nullable().optional() }))
	.handler(async ({ input: { teamId } }) => {
		const query: any = { deletedAt: null };
		if (teamId !== undefined) {
			query.teamId = teamId;
		}

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
	.handler(async ({ input: { promptId } }) => {
		const prompt = await db.prompts.find(promptId);

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
	.input(promptGetByCategoryZod.extend({ teamId: z.uuid().nullable().optional() }))
	.handler(async ({ input: { category, teamId } }) => {
		const query: any = { category, deletedAt: null };
		if (teamId !== undefined) {
			query.teamId = teamId;
		}

		const prompts = await db.prompts
			.where(query)
			.select("*")
			.order({ createdAt: "DESC" });

		return prompts;
	});

export const promptsRouter = {
	getAllActive,
	getRandomActive,
	getById,
	getByCategory,
};
