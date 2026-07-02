import type { AppDbTable } from "./db.manager";

/**
 * Result of an online-first write attempt.
 *
 * `savedOnline` — the server accepted the write and the local row was
 *   overwritten with the canonical server row. Nothing pending.
 *
 * `savedOffline` — the local write landed but the server call failed
 *   (network / 5xx / timeout). The row stays pending in Dexie; the sync
 *   orchestrator will retry on the next cycle.
 */
export type WriteStatus = "savedOnline" | "savedOffline";
export interface WriteResult {
	status: WriteStatus;
	error?: unknown;
}

export interface OnlineFirstCreateOptions<TInput, TServer> {
	/** The row shape sent to the local DB (with `createdAt: null`). */
	localWrite: () => Promise<void>;
	/** The RPC call that hits the server. Bounded by `timeoutMs`. */
	online: () => Promise<TServer>;
	/** Overwrite the local pending row(s) with the server's canonical row. */
	onlineOverwrite: (server: TServer) => Promise<void>;
	timeoutMs?: number;
	/** Optional — read as a fallback if you want to log something. */
	_input?: TInput;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Online-first write with offline fallback.
 *
 * Flow:
 *   1. Local write immediately (UI shows the row).
 *   2. Race the online call against `timeoutMs`.
 *   3. On success: overwrite pending row with canonical server row.
 *   4. On failure: leave pending row; sync-triggers.ts owns retry cadence.
 *
 * The same call site works whether the user is online or offline —
 * the pending row is the fallback, not a separate code path.
 */
export async function createOnlineFirst<TInput, TServer>(
	opts: OnlineFirstCreateOptions<TInput, TServer>,
): Promise<WriteResult> {
	await opts.localWrite();

	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	try {
		const server = await withTimeout(opts.online(), timeoutMs);
		await opts.onlineOverwrite(server);
		return { status: "savedOnline" };
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional — surface network failures so devs know sync kicked in
		console.warn("[OnlineFirstAdapter] online path failed; deferring to sync queue", err);
		// Sync is NOT triggered from here — trigger fan-out (sync-triggers.ts) owns retry cadence.
		return { status: "savedOffline", error: err };
	}
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`Timed out after ${ms}ms`)),
			ms,
		);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export type { AppDbTable };
