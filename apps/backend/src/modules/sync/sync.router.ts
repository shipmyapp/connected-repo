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
 * 
 * 1. Time Buffer: We go back at least 30 seconds from the requested 'since'.
 * 2. Count Buffer: We ensure at least the last 20 records are included, even 
 *    if they are older than the time buffer.
 * 3. Idempotency: The frontend uses setRow (UPSERT), so receiving the same 
 *    records multiple times is perfectly safe.
 * 4. Soft Deletes: We use .all() to include 'tombstones' (deletedAt IS NOT NULL) 
 *    so the frontend knows to delete them locally.
 */
export const getDelta = rpcProtectedProcedure
	.input(getDeltaInput)
	.handler(async ({ input: { since }, context: { user } }) => {
		
        const thirtySecondsAgo = since.getTime() - 30000;

        // --- Journal Entries Overlap Logic ---
        // 1. Get the 20th record's updatedAt to ensure we overlap by at least 20 records
        const twentiethJE = await db.journalEntries
            .select('updatedAt')
            .where({ authorUserId: user.id })
            .order({ updatedAt: 'DESC' })
            .limit(20)
            .includeDeleted()
            .then(res => res?.[res.length - 1]);

        const jeFloor = new Date(Math.min(
            thirtySecondsAgo, 
            twentiethJE?.updatedAt ?? thirtySecondsAgo
        ));

        const journalEntries = await db.journalEntries
			.where({ 
				authorUserId: user.id,
                updatedAt: { gte: jeFloor }
			})
			.select("*")
            .order({ updatedAt: 'DESC' })
            .includeDeleted();

        // --- Prompts Overlap Logic ---
        const twentiethPrompt = await db.prompts
            .where({ isActive: true })
            .order({ updatedAt: 'DESC' })
            .limit(20)
            .select('updatedAt')
            .includeDeleted()
            .then(res => res?.[res.length - 1]);

        const promptFloor = new Date(Math.min(
            thirtySecondsAgo, 
            twentiethPrompt?.updatedAt ?? thirtySecondsAgo
        ));

		const prompts = await db.prompts
			.where({ 
				isActive: true,
                updatedAt: { gte: promptFloor }
			})
			.select("*")
            .order({ updatedAt: 'DESC' })
            .includeDeleted();

		return {
			journalEntries,
			prompts,
			timestamp: new Date().toISOString()
		};
	});

export const liveSync = rpcProtectedProcedure
    .output(eventIterator(z.any())) // We can tighten this later
    .handler(async function* ({ context: { user }, signal }) {
        const iterator = syncService.subscribe(signal);
        
        for await (const payload of iterator) {
            // Yield heartbeats to all users to keep connections alive and provable
            if (payload.type === 'heartbeat') {
                yield payload;
                continue;
            }

            // Only yield data if the update belongs to this user or is public (prompts)
            if (payload.type === 'prompts' || (payload.type === 'journalEntries' && payload.userId === user.id)) {
                yield payload;
            }
        }
    });

export const syncRouter = {
	getDelta,
    liveSync,
};
