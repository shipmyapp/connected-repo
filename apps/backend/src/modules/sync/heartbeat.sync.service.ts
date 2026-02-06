import { EventPublisher } from "@orpc/server";

export type HeartbeatSyncPayload = { type: "heartbeat" };

export class HeartbeatSyncService {
	private publisher = new EventPublisher<{
		"heart-beat": HeartbeatSyncPayload;
	}>();
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private subscriberCount = 0;

	subscribe(signal?: AbortSignal) {
		// Start heartbeat if this is the first subscriber
		if (this.subscriberCount === 0) {
			this.startHeartbeat();
		}
		this.subscriberCount++;

		const subscription = this.publisher.subscribe("heart-beat", { signal });

		// Cleanup when subscription ends
		signal?.addEventListener('abort', () => {
			this.subscriberCount--;
			if (this.subscriberCount === 0) {
				this.stopHeartbeat();
			}
		});

		console.log("SSE subscriber	count: ", this.subscriberCount );
		return subscription;
	}

	push(payload: HeartbeatSyncPayload) {
		this.publisher.publish("heart-beat", payload);
	}

	private startHeartbeat() {
		if (this.intervalId) return;
		
		// Public heartbeat every 15s to keep SSE alive
		this.intervalId = setInterval(() => {
			this.push({ type: "heartbeat" });
		}, 15000);
	}

	private stopHeartbeat() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}
}

export const heartbeatSyncService = new HeartbeatSyncService();
