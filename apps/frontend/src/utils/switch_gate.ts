/**
 * Switch-gate: a structural coordination primitive that prevents outbound
 * RPCs from firing during a team switch.
 *
 * ## Why
 *
 * Team-switching is not atomic. The main-thread mutation, the header
 * cache, the worker cache and the backend session all flip in sequence.
 * Any RPC that leaves the app mid-flip carries an inconsistent tuple —
 * either the wrong `x-team-id` header, or the header + backend session
 * disagree — and either the request 403s or, worse, writes under a
 * different team than the UI thinks it's on.
 *
 * The old approach sprinkled defensive per-write context validity
 * checks around every DB write inside the sync orchestrator. That is
 * O(N) work for every write site, easy to forget, and does nothing for
 * non-orchestrator callers (React Query, etc.).
 *
 * The gate is O(1) at a single boundary: the ORPC link awaits
 * `waitOpen()` before every outbound request. The team switcher closes
 * the gate, mutates the backend session, flips the caches, then reopens
 * it. Requests never see an inconsistent snapshot because they never
 * dispatch during the flip.
 *
 * ## Cross-context coordination
 *
 * Two JS contexts (main thread + DataWorker) each hold their own module
 * state, but the header cache and the backend session are shared. The
 * gate is broadcast over `BroadcastChannel("switch-gate")` so closing on
 * the main thread also closes in the worker (and vice-versa). Requests
 * in either context wait on the same conceptual gate.
 *
 * ## Idempotence
 *
 * `open()` while open is a no-op. `close()` while closed is a no-op. The
 * caller does not need to track state.
 *
 * ## Timeout safety
 *
 * `waitOpen(timeoutMs = 30_000)` rejects if the gate stays closed for
 * longer than the timeout. This bounds request pile-ups when a tab is
 * backgrounded mid-switch and the switch never completes. Callers should
 * treat the rejection as a retriable transport error.
 */

const CHANNEL_NAME = "switch-gate";
const DEFAULT_TIMEOUT_MS = 30_000;

// The gate is "open" when `openPromise` is a resolved promise. It is
// "closed" when `openPromise` is a pending promise whose resolver we
// hold in `openResolve`.
let openPromise: Promise<void> = Promise.resolve();
let openResolve: (() => void) | null = null;
let isOpenFlag = true;

// Cross-context sync. `BroadcastChannel` is available in both window and
// worker scopes on modern browsers; we guard access defensively so the
// module is safe to import in test environments that lack it.
const channel: BroadcastChannel | null =
	typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

type GateMessage = { type: "close" } | { type: "open" };

if (channel) {
	channel.onmessage = (event: MessageEvent<GateMessage>) => {
		const msg = event.data;
		if (!msg || typeof msg !== "object") return;
		if (msg.type === "close") closeLocal();
		else if (msg.type === "open") openLocal();
	};
}

function closeLocal(): void {
	if (!isOpenFlag) return; // already closed → no-op
	isOpenFlag = false;
	openPromise = new Promise<void>((resolve) => {
		openResolve = resolve;
	});
}

function openLocal(): void {
	if (isOpenFlag) return; // already open → no-op
	isOpenFlag = true;
	const resolver = openResolve;
	openResolve = null;
	// Resolve the pending promise so every current waiter fires.
	if (resolver) resolver();
	// Replace with a pre-resolved promise so any awaiter created *after*
	// this point resolves synchronously.
	openPromise = Promise.resolve();
}

function broadcast(msg: GateMessage): void {
	if (!channel) return;
	try {
		channel.postMessage(msg);
	} catch {
		// Broadcast is best-effort; a closed channel is not fatal.
	}
}

export interface SwitchGate {
	/**
	 * Resolves immediately when the gate is open, otherwise waits until
	 * `open()` fires. Rejects after `timeoutMs` (default 30s) to prevent
	 * request pile-ups when a switch hangs (e.g. backgrounded tab).
	 */
	waitOpen(timeoutMs?: number): Promise<void>;
	/** Idempotent: no-op if the gate is already closed. */
	close(): void;
	/** Idempotent: no-op if the gate is already open. */
	open(): void;
	isOpen(): boolean;
}

export const switchGate: SwitchGate = {
	waitOpen(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
		if (isOpenFlag) return Promise.resolve();
		// Capture the promise so a subsequent close→open→close cycle
		// doesn't leave this waiter blocked on a stale pending promise.
		const currentGate = openPromise;
		return new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(
					new Error(
						`switchGate: waitOpen timed out after ${timeoutMs}ms — a team switch is stuck`,
					),
				);
			}, timeoutMs);
			currentGate.then(
				() => {
					clearTimeout(timer);
					resolve();
				},
				(err) => {
					clearTimeout(timer);
					reject(err);
				},
			);
		});
	},
	close(): void {
		if (!isOpenFlag) return;
		closeLocal();
		broadcast({ type: "close" });
	},
	open(): void {
		if (isOpenFlag) return;
		openLocal();
		broadcast({ type: "open" });
	},
	isOpen(): boolean {
		return isOpenFlag;
	},
};
