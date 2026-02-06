import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import {
	leadCreateInputZod,
	leadDeleteZod,
	leadGetByIdZod,
} from "@connected-repo/zod-schemas/leads.zod";

const getAll = rpcProtectedProcedure.handler(async ({ context: { user } }) => {
	const leads = await db.leads
		.where({ capturedByUserId: user.id });

	return leads;
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
