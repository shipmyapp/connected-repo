import { journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";
import { promptSelectAllZod } from "@connected-repo/zod-schemas/prompt.zod";
import { teamAppMemberSelectAllZod, teamAppSelectAllZod } from "@connected-repo/zod-schemas/team_app.zod";
import { EventPublisher } from "@orpc/server";
import { z } from "zod";

const syncToUserAndOptionalTeamAppOwnersAdminsZod = {
	syncToUserId: z.uuid(),
	syncToTeamAppIdOwnersAdmins: z.uuid().nullish(),
	syncToTeamAppIdAllMembers: z.null().optional(),
};

const syncToUserAndTeamAppOwnersAdminsZod = {
	syncToUserId: z.uuid(),
	syncToTeamAppIdOwnersAdmins: z.uuid().nullish(),
	syncToTeamAppIdAllMembers: z.null().optional(),
};

const syncToTeamAppIdAllMembersZod = {
	syncToUserId: z.null().optional(),
	syncToTeamAppIdOwnersAdmins: z.null().optional(),
	syncToTeamAppIdAllMembers: z.uuid(),
};

const syncToAllUsersZod = {
	syncToUserId: z.null().optional(),
	syncToTeamAppIdOwnersAdmins: z.null().optional(),
	syncToTeamAppIdAllMembers: z.null().optional(),
};

export const syncPayloadZod = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("data-change-journalEntries"),
    data: z.array(journalEntrySelectAllZod),
    operation: z.enum(["create", "update", "delete"]),
  }).extend(syncToUserAndOptionalTeamAppOwnersAdminsZod),
  z.object({
    type: z.literal("data-change-teamsApp"),
    data: z.array(teamAppSelectAllZod),
    operation: z.enum(["create", "update", "delete"]),
  }).extend(syncToTeamAppIdAllMembersZod),
  z.object({
    type: z.literal("data-change-teamMembers"),
    data: z.array(teamAppMemberSelectAllZod),
    operation: z.enum(["create", "update", "delete"]),
  }).extend(syncToUserAndTeamAppOwnersAdminsZod),
  z.object({
    type: z.literal("data-change-prompts"),
    data: z.array(promptSelectAllZod),
    operation: z.enum(["create", "update", "delete"]),
  }).extend(syncToAllUsersZod),
  z.object({
    type: z.literal("heartbeat"),
  }).extend(syncToAllUsersZod),
]);

export type SyncPayload = z.infer<typeof syncPayloadZod>;

export class SyncService {
	private publisher = new EventPublisher<{
		"data-change": SyncPayload;
	}>();
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private subscriberCount = 0;

	subscribe(signal?: AbortSignal) {
		if(this.subscriberCount === 0){
			this.startHeartbeat();
		}
		this.subscriberCount++;

		const subscription = this.publisher.subscribe("data-change", { signal });

		// Cleanup when subscription ends
		signal?.addEventListener('abort', () => {
			this.subscriberCount--;
			if (this.subscriberCount === 0) {
				this.stopHeartbeat();
			}
		});

		console.log(`[SyncService] Subscriber count: ${this.subscriberCount}`);
		return subscription;
	}

	push(payload: SyncPayload) {
		this.publisher.publish("data-change", payload);
	}

	private startHeartbeat() {
		if (this.intervalId) return;
		
		// Proactive heartbeat to keep connections alive and allow clients to detect server death.
		this.intervalId = setInterval(() => {
			this.push({ type: "heartbeat" });
		}, 10000);
	}

	private stopHeartbeat() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}
}

export const syncService = new SyncService();
