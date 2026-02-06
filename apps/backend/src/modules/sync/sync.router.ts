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
		
        // 1. Get user's team memberships with joinedAt
        const memberships = await db.teamMembers
            .where({ userId: user.id })
            .select('userTeamId', 'joinedAt');

        const sinceTime = since.getTime();
        
        // Split into "newly joined" vs "existing" teams
        // If joinedAt > since, we need to fetch ALL leads for that team (bootstrap), 
        // ignoring the updatedAt filter for them (but still respecting 30s buffer if needed, usually effectively all).
        
        const newTeamIds = memberships
            .filter(m => Number(m.joinedAt) > sinceTime)
            .map(m => m.userTeamId);
            
        const existingTeamIds = memberships
            .filter(m => Number(m.joinedAt) <= sinceTime)
            .map(m => m.userTeamId);

        // --- Step A: Calculate Safety Floor for Incremental Sync ---
        // (Only relevant for Personal and Existing Teams)
        
        const incrementalFilter = (q: any) => {
             const conditions: any[] = [{ capturedByUserId: user.id }];
             if (existingTeamIds.length > 0) {
                conditions.push({ userTeamId: { in: existingTeamIds } });
             }
             return q.or(conditions);
        };

        const twentyLeads = await db.leads
            .select('updatedAt')
            .where(incrementalFilter)
            .order({ updatedAt: 'DESC' })
            .limit(20)
            .includeDeleted();
            
        const twentiethLead = twentyLeads[twentyLeads.length - 1];

        const leadFloor = new Date(Math.min(
            thirtySecondsAgo, 
            twentyLeads.length > 0 ? (twentiethLead?.updatedAt?.getTime() ?? thirtySecondsAgo) : thirtySecondsAgo
        ));
        
        // --- Step B: Build Final Query ---
        // 1. Personal & Existing Teams: >= leadFloor
        // 2. New Teams: All time (no floor)

        const finalFilter = (q: any) => {
            const conditions: any[] = [];
            const timestampCriteria = { updatedAt: { gte: leadFloor } };
            
            // 1. Personal
            conditions.push({ 
                capturedByUserId: user.id,
                ...timestampCriteria
            });
            
            // 2. Existing Teams
            if (existingTeamIds.length > 0) {
                conditions.push({
                    userTeamId: { in: existingTeamIds },
                    ...timestampCriteria
                });
            }
            
            // 3. New Teams (Fetch EVERYTHING)
            if (newTeamIds.length > 0) {
                 conditions.push({
                    userTeamId: { in: newTeamIds }
                });
            }
            
            return q.or(conditions);
        };

        const leads = await db.leads
			.where(finalFilter)
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
