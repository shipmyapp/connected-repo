import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import {
	leadCreateInputZod,
	leadDeleteZod,
	leadGetByIdZod,
} from "@connected-repo/zod-schemas/leads.zod";
import z from "zod";

const getAll = rpcProtectedProcedure
	.input(
		z.object({
			userTeamId: z.string().max(26).nullable().optional(),
		}).optional()
	)
	.handler(async ({ input, context: { user } }) => {
		let query = db.leads.where({ capturedByUserId: user.id });

		if (input?.userTeamId) {
			query = query.where({ userTeamId: input.userTeamId });
		} else {
            // If explicit null is passed or simply no team, filter for personal leads (null team)
            // But we need to decide default behavior if input is undefined.
            // If undefined (e.g. legacy calls), maybe we return all? 
            // Or strictly follow: undefined input = personal?
            // Let's match frontend: frontend passes userTeamId or null.
            
            // If userTeamId is provided (string), filter by it.
            // If userTeamId is null (explicitly personal), filter where userTeamId is null.
            // If input is undefined, maybe return all? Or assume personal?
            // "Personal" workspace usually means userTeamId IS NULL.
            
            if (input && input.userTeamId === null) {
                 query = query.where({ userTeamId: null });
            } else if (input?.userTeamId) {
                 // Handled above
            }
            
            // If input is strictly undefined (no filter requested), originally it returned ALL user leads.
            // We should maintain that for backward compatibility unless we want strict workspaces.
            // Let's leave query as-is if no input.
		}

		return await query;
	});

const getById = rpcProtectedProcedure
	.input(leadGetByIdZod)
	.handler(async ({ input: { leadId }, context: { user } }) => {
		const lead = await db.leads
			.find(leadId)
			.where({ capturedByUserId: user.id });

		return lead;
	});

const create = rpcProtectedProcedure
	.input(leadCreateInputZod)
	.handler(async ({ input, context: { user } }) => {
		const newLead = await db.leads.create({
			...input,
			capturedByUserId: user.id,
		});

		return newLead;
	});

const deleteLead = rpcProtectedProcedure
	.input(leadDeleteZod)
	.handler(async ({ input: { leadId }, context: { user } }) => {
		await db.leads
			.find(leadId)
			.where({ capturedByUserId: user.id })
			.delete();

		return { success: true };
	});

export const leadsRouter = {
	getAll,
	getById,
	create,
	delete: deleteLead,
};
