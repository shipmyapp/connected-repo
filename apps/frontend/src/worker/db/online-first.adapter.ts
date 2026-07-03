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

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Thrown by `onlineOnlyWrite` when the server can't be reached. Callers
 * that need offline-only branching (e.g. "leave the toggle in its old
 * state") should catch this specifically.
 */
export class OfflineWriteError extends Error {
	constructor(
		public readonly entityName: string,
		public readonly cause: unknown,
	) {
		super(`Offline: ${entityName} could not be written`);
		this.name = "OfflineWriteError";
	}
}

// ─── Error classifier ─────────────────────────────────────────────────
//
// Ports the Flutter recoverable-error contract:
//
//   - network / timeout / 5xx / offline → recoverable → fall back to the
//     offline pipeline (queue for sync). Do NOT rethrow.
//   - 4xx / validation / auth / anything else → NOT recoverable → rethrow.
//     A validation failure must not silently write a poisoned pending row
//     that will retry forever.
//
// oRPC wraps server errors with a `status` field on the error object.
// Network errors from fetch surface as `TypeError`. Aborts are treated as
// recoverable (fired during navigation, page hide, offline transition).

interface OrpcLikeError {
	name?: string;
	status?: number;
	code?: string;
	message?: string;
	cause?: { name?: string; message?: string; code?: string };
}

const TIMEOUT_SENTINEL_MESSAGE = "__OnlineFirstAdapter/timeout__";

/**
 * Returns `true` when the error looks like something the sync retry
 * pipeline can eventually resolve — i.e. safe to fall back to offline.
 */
export function isRecoverableError(err: unknown): boolean {
	if (!err) return false;

	// Our own timeout sentinel — always recoverable.
	if (err instanceof Error && err.message === TIMEOUT_SENTINEL_MESSAGE) {
		return true;
	}

	// fetch TypeError (DNS fail / no route / conn reset).
	if (err instanceof TypeError) return true;

	const e = err as OrpcLikeError;
	const status = typeof e.status === "number" ? e.status : undefined;

	// 5xx → server is up but broken; retry later.
	if (status && status >= 500 && status < 600) return true;
	// 408 / 429 → transient, retry with backoff.
	if (status === 408 || status === 429) return true;

	// 4xx (non-transient) → business error; rethrow so the caller (UI)
	// can surface it. Never queue.
	if (status && status >= 400 && status < 500) return false;

	// Abort / navigation cancellation. Sync will re-fire on the next
	// trigger.
	const name = e.name ?? e.cause?.name;
	const msg = e.message ?? "";
	const causeMsg = e.cause?.message ?? "";
	if (
		name === "AbortError" ||
		msg.includes("signal is aborted") ||
		msg.includes("aborted a request") ||
		causeMsg.includes("aborted a request") ||
		causeMsg.includes("signal is aborted")
	) {
		return true;
	}

	// Unknown shapes — treat as recoverable so a client-side bug doesn't
	// wedge the queue. Poisoned-row protection comes from the explicit
	// 4xx branch above; nothing here should carry a validation failure.
	return true;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(TIMEOUT_SENTINEL_MESSAGE)),
			ms,
		);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/**
 * Log an online-path failure. When we're still online, this indicates
 * a real backend problem — log at `warn` so devtools show it. When
 * navigator flipped offline, it's expected — log at `debug`.
 */
function logFallback(label: string, err: unknown): void {
	const stillOnline =
		typeof navigator !== "undefined" ? navigator.onLine : true;
	// biome-ignore lint/suspicious/noConsole: surface online-path failures so devs know sync kicked in
	(stillOnline ? console.warn : console.debug)(
		`[OnlineFirstAdapter] ${label}: online path failed; deferring to sync queue`,
		err,
	);
}

// ─── createOnlineFirst ────────────────────────────────────────────────

export interface OnlineFirstCreateOptions<TInput, TServer> {
	/** The row shape sent to the local DB (with `createdAt: null`). */
	localWrite: () => Promise<void>;
	/** The RPC call that hits the server. Bounded by `timeoutMs`. */
	online: () => Promise<TServer>;
	/** Overwrite the local pending row(s) with the server's canonical row. */
	onlineOverwrite: (server: TServer) => Promise<void>;
	timeoutMs?: number;
	/** Diagnostic label used in fallback logs. */
	entityName?: string;
	/** Optional — retained for callers that want to log the input. */
	_input?: TInput;
}

/**
 * Online-first CREATE with offline fallback.
 *
 * Flow:
 *   1. Local write immediately (UI shows the row).
 *   2. Race the online call against `timeoutMs`.
 *   3. On success: overwrite pending row with canonical server row.
 *   4. On recoverable failure: leave pending row; sync-triggers own retry.
 *   5. On business failure (4xx): rethrow so the UI can show the error.
 */
export async function createOnlineFirst<TInput, TServer>(
	opts: OnlineFirstCreateOptions<TInput, TServer>,
): Promise<WriteResult> {
	await opts.localWrite();

	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const label = opts.entityName ?? "create";

	try {
		const server = await withTimeout(opts.online(), timeoutMs);
		await opts.onlineOverwrite(server);
		return { status: "savedOnline" };
	} catch (err) {
		if (!isRecoverableError(err)) throw err;
		logFallback(label, err);
		return { status: "savedOffline", error: err };
	}
}

// ─── updateOnlineFirst ────────────────────────────────────────────────

export interface OnlineFirstUpdateOptions<TServer> {
	/** Whether the row was confirmed by the server (createdAt IS NOT NULL). */
	isConfirmed: boolean;
	/** Apply the edit to the local Dexie row. Always runs. */
	localUpdate: () => Promise<void>;
	/**
	 * The RPC that hits the server. Only invoked for `isConfirmed` rows —
	 * pending rows carry their edits along in the eventual pushCreates.
	 */
	online: () => Promise<TServer>;
	/** Overwrite the local row with the server's canonical row on success. */
	onlineOverwrite: (server: TServer) => Promise<void>;
	timeoutMs?: number;
	entityName?: string;
}

/**
 * Online-first UPDATE.
 *
 *   - Pending row: apply the edit locally; pushCreates will send the
 *     final state when it eventually runs. No online call.
 *   - Confirmed row: apply locally, race online, overwrite from server
 *     on success; on recoverable failure, mark it via `syncError`
 *     (caller's responsibility inside `localUpdate` if needed).
 */
export async function updateOnlineFirst<TServer>(
	opts: OnlineFirstUpdateOptions<TServer>,
): Promise<WriteResult> {
	await opts.localUpdate();

	if (!opts.isConfirmed) {
		return { status: "savedOffline" };
	}

	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const label = opts.entityName ?? "update";

	try {
		const server = await withTimeout(opts.online(), timeoutMs);
		await opts.onlineOverwrite(server);
		return { status: "savedOnline" };
	} catch (err) {
		if (!isRecoverableError(err)) throw err;
		logFallback(label, err);
		return { status: "savedOffline", error: err };
	}
}

// ─── deleteOnlineFirst ────────────────────────────────────────────────

export interface OnlineFirstDeleteOptions {
	/** Whether the row was confirmed by the server (createdAt IS NOT NULL). */
	isConfirmed: boolean;
	/**
	 * Drop the row entirely from the local table (and any dependent
	 * children — files, etc.). Called for pending rows immediately, and
	 * for confirmed rows after the server confirms the delete.
	 */
	hardDeleteLocal: () => Promise<void>;
	/**
	 * The RPC that hits the server. Only invoked for confirmed rows.
	 * The server-side delete is currently a HARD delete — there is no
	 * push-delete queue on the client, so a confirmed-row delete that
	 * can't reach the server throws `OfflineWriteError` rather than
	 * leaving a lingering tombstone the sync pipeline can't reconcile.
	 */
	online: () => Promise<void>;
	timeoutMs?: number;
	entityName?: string;
}

/**
 * DELETE with pending fast-path.
 *
 *   - Pending row (locally created, never confirmed): hard-delete
 *     locally, no server call. The pushCreates pipeline will see the
 *     row is gone and stop trying to send it.
 *   - Confirmed row: race the online delete. On success: hard-delete
 *     locally. On recoverable failure: throw `OfflineWriteError` so
 *     the caller can surface "try again when online" — we don't have
 *     a push-delete queue yet, so silently tombstoning would create a
 *     row the UI can't show but the server still has.
 */
export async function deleteOnlineFirst(
	opts: OnlineFirstDeleteOptions,
): Promise<WriteResult> {
	if (!opts.isConfirmed) {
		await opts.hardDeleteLocal();
		return { status: "savedOnline" };
	}

	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	try {
		await withTimeout(opts.online(), timeoutMs);
		await opts.hardDeleteLocal();
		return { status: "savedOnline" };
	} catch (err) {
		if (isRecoverableError(err)) {
			throw new OfflineWriteError(opts.entityName ?? "delete", err);
		}
		throw err;
	}
}

// ─── onlineOnlyWrite ──────────────────────────────────────────────────

export interface OnlineOnlyWriteOptions<T> {
	entityName: string;
	op: () => Promise<T>;
	timeoutMs?: number;
}

/**
 * Confirmed-row writes that CANNOT queue offline meaningfully —
 * device-token registration, per-session state, etc. Throws
 * `OfflineWriteError` on recoverable failure so the caller can surface
 * a "try again when back online" message; rethrows non-recoverable
 * (4xx) errors verbatim so the caller can distinguish "server refused"
 * from "network was down."
 */
export async function onlineOnlyWrite<T>(
	opts: OnlineOnlyWriteOptions<T>,
): Promise<T> {
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	try {
		return await withTimeout(opts.op(), timeoutMs);
	} catch (err) {
		if (isRecoverableError(err)) {
			throw new OfflineWriteError(opts.entityName, err);
		}
		throw err;
	}
}

// ─── readWithFallback ─────────────────────────────────────────────────

export interface ReadWithFallbackOptions<T> {
	/** RPC to fetch from the server. Bounded by `timeoutMs`. */
	online: () => Promise<T>;
	/** Read from the local Dexie mirror. */
	offline: () => Promise<T>;
	/** Fire-and-forget cache backfill on successful online read. */
	writeOnSuccess?: (server: T) => Promise<void>;
	timeoutMs?: number;
	entityName?: string;
}

export type ReadSource = "online" | "offline";
export interface ReadResult<T> {
	data: T;
	source: ReadSource;
}

/**
 * Read with online-first + offline fallback. Returns the source so the
 * UI can render a "showing cached data" hint when it lost the race.
 *
 * The `writeOnSuccess` callback (if provided) is fired asynchronously
 * on successful online read so the local mirror stays warm. It runs
 * OUTSIDE the return path — a failed cache write does not fail the read.
 */
export async function readWithFallback<T>(
	opts: ReadWithFallbackOptions<T>,
): Promise<ReadResult<T>> {
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const label = opts.entityName ?? "read";
	try {
		const data = await withTimeout(opts.online(), timeoutMs);
		if (opts.writeOnSuccess) {
			void opts.writeOnSuccess(data).catch((err) => {
				// biome-ignore lint/suspicious/noConsole: fire-and-forget cache backfill
				console.debug(
					`[OnlineFirstAdapter] ${label}: writeOnSuccess failed`,
					err,
				);
			});
		}
		return { data, source: "online" };
	} catch (err) {
		if (!isRecoverableError(err)) throw err;
		logFallback(label, err);
		const data = await opts.offline();
		return { data, source: "offline" };
	}
}

export type { AppDbTable };
