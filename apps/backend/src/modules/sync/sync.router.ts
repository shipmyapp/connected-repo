import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { eventIterator } from "@orpc/server";
import { z } from "zod";
import { syncService } from "./sync.service";

const getDeltaInput = z.object({
	since: z.string().or(z.number()).transform(v => new Date(v)),
});

/**
 * getDelta: Performs an incremental sync (delta sync) between server and client.
 * 
 * OVERLAP SYNC STRATEGY:
 * To handle the "Transaction Gap" (where some transactions commit late with an 
 * older timestamp), we don't just query 'updatedAt > since'. Instead, we 
 * provide a safety overlap.
 */
export const getDelta = rpcProtectedProcedure
	.input(getDeltaInput)
	.handler(async ({ input: { since }, context: { user } }) => {
		
        const thirtySecondsAgo = since.getTime() - 30000;

        // --- Leads Overlap Logic ---
        const twentiethLead = await db.leads
            .select('updatedAt')
            .where({ capturedByUserId: user.id })
            .order({ updatedAt: 'DESC' })
            .limit(20)
            .includeDeleted()
            .then(res => res?.[res.length - 1]);

        const leadFloor = new Date(Math.min(
            thirtySecondsAgo, 
            twentiethLead?.updatedAt ?? thirtySecondsAgo
        ));

        const leads = await db.leads
			.where({ 
				capturedByUserId: user.id,
                updatedAt: { gte: leadFloor }
			})
			.select("*")
            .order({ updatedAt: 'DESC' })
            .includeDeleted();

		return {
			leads,
			timestamp: new Date().toISOString()
		};
	});

export const liveSync = rpcProtectedProcedure
    .output(eventIterator(z.any()))
    .handler(async function* ({ context: { user }, signal }) {
        const iterator = syncService.subscribe(signal);
        
        for await (const payload of iterator) {
            if (payload.type === 'heartbeat') {
                yield payload;
                continue;
            }

            // Only yield data if the update belongs to this user
            if (payload.userId === user.id) {
                yield payload;
            }
        }
    });

export const syncRouter = {
	getDelta,
    liveSync,
};
