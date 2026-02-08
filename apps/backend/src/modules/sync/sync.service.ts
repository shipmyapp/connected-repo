import { journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";
import { promptSelectAllZod } from "@connected-repo/zod-schemas/prompt.zod";
import { EventPublisher } from "@orpc/server";
import { z } from "zod";

export const deltaOutputZod = z.object({
	type: z.literal("delta"),
	table: z.enum(["journalEntries", "prompts"]),
	data: z.array(z.any()),
	isLastChunk: z.boolean(),
	error: z.string().optional(),
});

export const syncPayloadZod = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("data-change-journalEntries"),
    userId: z.string(),
    data: z.array(journalEntrySelectAllZod),
    operation: z.enum(["create", "update", "delete"]),
  }),
  z.object({
    type: z.literal("data-change-prompts"),
    userId: z.null(),
    data: z.array(promptSelectAllZod),
    operation: z.enum(["create", "update", "delete"]),
  }),
  z.object({
    type: z.literal("heartbeat"),
    userId: z.null(),
  }),
]);

export type SyncPayload = z.infer<typeof syncPayloadZod>;
export type DeltaOutput = z.infer<typeof deltaOutputZod>;

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
			this.push({ type: "heartbeat", userId: null });
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
