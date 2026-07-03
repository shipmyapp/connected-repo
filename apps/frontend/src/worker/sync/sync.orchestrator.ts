import type { TablesToSync } from "@connected-repo/zod-schemas/enums.zod";
import type { TeamAppMemberSelectAll, TeamAppSelectAll } from "@connected-repo/zod-schemas/team_app.zod";
import { journalEntriesDb } from "../../modules/journal-entries/worker/journal-entries.db";
import { promptsDb } from "../../modules/prompts/worker/prompts.db";
import {
	ACTIVE_TEAM_WIPED_CHANNEL,
	type ActiveTeamWipedMessage,
} from "../../utils/active_team_wiped.channel";
import { orpcFetch } from "../../utils/orpc.client";
import { initDb } from "../db/db.lifecycle";
import { subscribe } from "../db/db.manager";
import { filesDb } from "../db/files.db";
import { syncMetadataDb } from "../db/sync_metadata.db";
import { wipeTeamDataFromDb } from "../db/team_data.wipe";
import { teamMembersDb } from "../db/team_members.db";
import { teamsAppDb } from "../db/teams_app.db";
import { setActiveTeamId as _setActiveTeamId, getActiveTeamId } from "./active_team";
import { fileUploadWorker } from "./file_upload.worker";
import { pendingEditLockRegistry } from "./pending-edit-lock.registry";
import {
	SYNC_ENGINE_STATE_CHANNEL,
	type SyncEngineStateMessage,
} from "./sync-engine-state.channel";

// Producer-side channel for the "your active team is gone" signal.
// Guarded because unit-test environments may lack `BroadcastChannel`.
const activeTeamWipedChannel: BroadcastChannel | null =
	typeof BroadcastChannel !== "undefined"
		? new BroadcastChannel(ACTIVE_TEAM_WIPED_CHANNEL)
		: null;

// Producer-side channel for transient `isRunning` state — see
// `sync-engine-state.channel.ts` for why this isn't in Dexie.
const syncEngineStateChannel: BroadcastChannel | null =
	typeof BroadcastChannel !== "undefined"
		? new BroadcastChannel(SYNC_ENGINE_STATE_CHANNEL)
		: null;

const broadcastRunning = (isRunning: boolean): void => {
	const msg: SyncEngineStateMessage = { isRunning };
	try {
		syncEngineStateChannel?.postMessage(msg);
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: broadcast failures should surface in devtools
		console.warn("[SyncOrchestrator] failed to broadcast isRunning", err);
	}
};

/**
 * Public Comlink-facing surface. Explicit interface so TypeScript can
 * emit a proper declaration for the exported DataWorker API — the class
 * itself has private members and can't be re-exported anonymously
 * (TS4094).
 */
export interface SyncOrchestratorApi {
	initForUser(userId: string): Promise<void>;
	stop(): void;
	setActiveTeamId(id: string | null): void;
	/**
	 * Full sync cycle — pull server changes + push local. Defaults to
	 * throttled: skipped inside `THROTTLE_WINDOW_MS` of the last
	 * completion. Pass `force: true` from user-initiated triggers
	 * ("Sync now" button, per-row Retry).
	 */
	processQueue(force?: boolean): Promise<void>;
	/**
	 * Event-driven push + upload only (no pull). Not throttled — fires
	 * immediately on natural events: external file writes (start
	 * uploads), file-upload completion (push CDN URLs), online
	 * reconnect (send offline creates). This is the mechanism that
	 * makes create/update/upload atomic without waiting for the
	 * 2-minute pull cadence.
	 */
	drainLocalChanges(): Promise<void>;
	waitForReady(): Promise<void>;
}

/**
 * Sync orchestrator (no SSE).
 *
 * Lifecycle:
 *   `initForUser(userId)` MUST be called before any sync operation.
 *   The per-user Dexie DB is opened (and any other user's DB on the
 *   same device is dropped) during init. Teams are joined/left via the
 *   normal team-management routes; the client updates `activeTeamId`
 *   from the profile-page team switcher.
 *
 * Wave-1 anchor mints `topLevelSyncedAt` server-side; every downstream
 * pull echoes it back so the whole cycle sees a consistent snapshot
 * ceiling. Cursors are per-team so switching between teams doesn't
 * collide.
 *
 * Two operations, two trigger models:
 *
 *   `processQueue()` — full cycle (pull + push + upload). THROTTLED
 *   to `THROTTLE_WINDOW_MS`. Triggers:
 *     - visibilitychange / focus / online events
 *     - Silent-sync FCM push → SW postMessage
 *     - 2-minute main-thread interval (visibility-gated)
 *     - 2-minute worker-realm safety-net interval
 *     - User-forced (`force: true`): Sync-now button, per-row Retry
 *
 *   `drainLocalChanges()` — event-driven push + upload only. NOT
 *   throttled. Triggers:
 *     - `subscribe()` DB-write callback on external `files` writes —
 *       fires the upload worker as soon as a blob is staged.
 *     - Browser `online` event — sends offline-created entries + CDN
 *       updates the moment the network returns.
 *     - After a file upload completes — kicks pushCdnUpdates so the
 *       fresh URL is atomic with the upload.
 *
 * External `journalEntries` writes are handled by `createOnlineFirst`
 * itself (online RPC direct or savedOffline queued). They do NOT
 * trigger `drainLocalChanges` — that would race the in-flight direct
 * create RPC and double-send the row.
 */
// Coalesce trigger-heavy scenarios (a form submit fires several writes
// back to back; visibility/focus events pile on) into a single cycle
// per window. See processQueue for the throttle contract.
const THROTTLE_WINDOW_MS = 120_000; // 2 minutes

class SyncOrchestrator implements SyncOrchestratorApi {
	private isProcessing = false;
	// Re-fire kind after a running op finishes:
	//   needsRescan → re-fire processQueue (full cycle, throttled)
	//   needsDrainRescan → re-fire drainLocalChanges (push+upload only)
	// A trigger that arrives during a running op sets the appropriate
	// flag; the finally block picks whichever is set. Full cycle wins
	// if both are set (it covers drain's work).
	private needsRescan = false;
	private needsDrainRescan = false;
	private intervalHandle: ReturnType<typeof setInterval> | null = null;
	private initialisedForUserId: string | null = null;
	private lastCompletedAt: number | null = null;

	// Resolves once `initForUser` has opened the per-user Dexie DB.
	// Used by `mirrorToLocalDb` so callers can fire the mirror before
	// `initForUser` has been invoked (e.g. `authLoader`) — the write
	// queues until the DB is open.
	private readyResolve!: () => void;
	private readyPromise: Promise<void> = new Promise((resolve) => {
		this.readyResolve = resolve;
	});

	private readonly WAVE_ORDER: TablesToSync[] = [
		"teamsApp",
		"teamMembers",
		"prompts",
		"journalEntries",
		"files",
	];

	/**
	 * Open the per-user Dexie DB (drops any previous user's DB on this
	 * device) and register the workers' background triggers. Idempotent
	 * for the same userId; a different userId reboots the DB and clears
	 * the active team.
	 */
	async initForUser(userId: string): Promise<void> {
		if (this.initialisedForUserId === userId) {
			this.readyResolve();
			return;
		}

		await initDb(userId);
		this.initialisedForUserId = userId;
		this.readyResolve();

		// One-shot repair for the historical pull-clobber-push bug that
		// stranded thumbnails as `state === "uploaded"` but
		// `thumbnailCdnUrl === null` on both client and server. Resets
		// those rows back to `pending` so the FileUploadWorker
		// regenerates and re-uploads from OPFS on its next tick. Safe
		// no-op for fresh DBs and for users who never hit the bug.
		try {
			const repaired = await filesDb.recoverStrandedThumbnails();
			if (repaired > 0) {
				// biome-ignore lint/suspicious/noConsole: legitimate one-shot recovery signal
				console.info(
					`[SyncOrchestrator] reset ${repaired} stranded thumbnail(s) back to pending`,
				);
			}
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: recovery failure shouldn't block init
			console.warn("[SyncOrchestrator] thumbnail recovery failed", err);
		}

		// Clear active team on user switch — the main thread will push
		// the fresh team id in via `setActiveTeamId` after user login.
		_setActiveTeamId(null);

		if (this.intervalHandle) return; // triggers already registered

		// Subscribe fan-out from any local write (worker realm and
		// broadcast from main). We react only to `files` external
		// writes — those need the upload worker + pushCdnUpdates
		// kicked immediately. `journalEntries` writes are handled by
		// `createOnlineFirst` on the main thread (direct online RPC
		// or savedOffline queue); reacting here would race the
		// in-flight direct create RPC.
		//
		// Sync-tagged writes (`source === "sync"`) are our own pipeline
		// echoing back — skip to avoid a self-trigger loop. But the
		// file-upload worker uses source="sync" too, so we can't
		// distinguish "upload succeeded, please push CDN URL" from
		// "we just wrote pull results". That's why fileUploadWorker
		// itself calls `drainLocalChanges` on each successful upload.
		subscribe((table, source) => {
			if (table !== "files") return;
			if (source === "sync") return;
			void this.drainLocalChanges();
		});

		// Online reconnect — send anything that queued up while offline
		// (pending journal-entry creates, staged file blobs, CDN URLs).
		// This is the event that makes the reconnect story work without
		// waiting for the next 2-minute pull tick.
		self.addEventListener("online", () => {
			void this.drainLocalChanges();
		});

		// Trigger #5: safety-net interval. Matches the main-thread's
		// 2-minute foreground cadence (see sync-triggers.ts). The worker
		// realm has no `document.visibilityState` — it fires regardless
		// of whether the tab is focused, so a hung main thread doesn't
		// leave the sync queue frozen.
		this.intervalHandle = setInterval(() => {
			this.processQueue();
		}, 120_000);
	}

	stop(): void {
		if (this.intervalHandle) {
			clearInterval(this.intervalHandle);
			this.intervalHandle = null;
		}
	}

	waitForReady(): Promise<void> {
		return this.readyPromise;
	}

	setActiveTeamId(id: string | null): void {
		_setActiveTeamId(id);
		if (id) this.processQueue();
	}

	// Team-wipe wiring:
	//
	//   The pull pipeline itself detects the two "you no longer belong
	//   here" signals — a tombstoned `teams` row we already have locally,
	//   or a tombstoned `team_members` row for the current user. Both
	//   arrive as soft-deleted rows because `sync_delta.sync.service.ts`
	//   explicitly `.includeDeleted()` on every pull. Detection runs
	//   INLINE inside `runCycle` (right after the relevant pull's
	//   bulkUpsert) so the concurrency hazard doesn't exist: we're
	//   already holding `isProcessing`, so no other cycle can be
	//   overwriting our wipe.
	//
	//   The wipe happens BEFORE the push pipeline runs — otherwise we'd
	//   push mutations for a team we no longer belong to. If the wiped
	//   team is the currently-active team, we broadcast on
	//   `active-team-wiped` so `WorkspaceContext` can drive the switch-
	//   gate flow (auto-switch to another team the user still belongs
	//   to, or force sign-out). The orchestrator itself cannot invoke
	//   the switch — the switch needs the router revalidator and the
	//   React Query cache, both of which live on the main thread.

	/**
	 * Entry point for every trigger. Locks against concurrent runs; if a
	 * trigger arrives while a cycle is in flight, we set `needsRescan`
	 * and the current cycle re-invokes itself on completion.
	 *
	 * Throttle (absolute, unless `force === true`): a cycle that
	 * completed inside `THROTTLE_WINDOW_MS` is skipped no matter
	 * what — including when there's pending work to push. Pending
	 * items just wait for the next scheduled cycle. This is the
	 * deliberate contract: within the 2-minute window, the ONLY
	 * things that fire a cycle are user-initiated actions (Sync
	 * now, per-row Retry) that pass `force: true`. Everything
	 * else (writes, visibility change, focus, online, silent-push
	 * wake, form-submit kicks) coalesces to zero extra cycles.
	 */
	async processQueue(force = false): Promise<void> {
		if (this.isProcessing) {
			this.needsRescan = true;
			return;
		}
		if (!this.initialisedForUserId) return; // pre-login
		if (!self.navigator?.onLine) return;

		const teamId = getActiveTeamId();
		if (!teamId) return; // no active team → nothing to sync

		// Absolute throttle. Pending work does NOT bypass — the caller
		// either passes `force: true` (user tapped Sync now / Retry) or
		// waits for the next scheduled cycle. See the class-level doc
		// comment for the rationale.
		if (!force && this.lastCompletedAt !== null) {
			const since = Date.now() - this.lastCompletedAt;
			if (since < THROTTLE_WINDOW_MS) return;
		}

		this.isProcessing = true;
		this.needsRescan = false;
		this.needsDrainRescan = false;
		broadcastRunning(true);
		await syncMetadataDb.saveCycleState({ lastAttemptedAt: Date.now() });

		try {
			await this.runCycle(teamId);
			const now = Date.now();
			this.lastCompletedAt = now;
			await syncMetadataDb.saveCycleState({
				lastCompletedAt: now,
				lastError: null,
			});
		} catch (err) {
			await syncMetadataDb.saveCycleState({
				lastError: err instanceof Error ? err.message : String(err),
			});
			// biome-ignore lint/suspicious/noConsole: sync failures should surface in devtools
			console.warn("[SyncOrchestrator] cycle failed", err);
		} finally {
			this.isProcessing = false;
			broadcastRunning(false);
			if (this.needsRescan) {
				this.needsRescan = false;
				this.needsDrainRescan = false;
				void this.processQueue();
			} else if (this.needsDrainRescan) {
				this.needsDrainRescan = false;
				void this.drainLocalChanges();
			}
		}
	}

	/**
	 * Push + upload only (no pull). Not throttled — fires on natural
	 * events so create/update/upload feel atomic without waiting for
	 * the 2-minute pull cadence.
	 *
	 * Callers:
	 *   - subscribe callback on external `files` writes
	 *   - `online` event listener (send offline-created rows on reconnect)
	 *   - FileUploadWorker after a successful CDN upload (push URL)
	 */
	async drainLocalChanges(): Promise<void> {
		if (this.isProcessing) {
			this.needsDrainRescan = true;
			return;
		}
		if (!this.initialisedForUserId) return;
		if (!self.navigator?.onLine) return;
		const teamId = getActiveTeamId();
		if (!teamId) return;

		this.isProcessing = true;
		this.needsDrainRescan = false;
		broadcastRunning(true);

		try {
			void fileUploadWorker.run();
			await this.runPushPipeline(teamId);
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: surface push failures
			console.warn("[SyncOrchestrator] drainLocalChanges failed", err);
		} finally {
			this.isProcessing = false;
			broadcastRunning(false);
			if (this.needsRescan) {
				this.needsRescan = false;
				this.needsDrainRescan = false;
				void this.processQueue();
			} else if (this.needsDrainRescan) {
				this.needsDrainRescan = false;
				void this.drainLocalChanges();
			}
		}
	}

	private async runCycle(teamId: string): Promise<void> {
		// Guard the DB-swap case: `initForUser` must have run and the
		// active user must still match what we opened the DB for. If a
		// different user signed in between scheduling and running this
		// cycle, bail before touching any DB.
		if (!this.initialisedForUserId) return;

		// Team-switch drift is handled STRUCTURALLY by `switchGate` at the
		// ORPC link boundary — the gate is closed before the header cache
		// flips, so no RPC inside this cycle can straddle a switch. The
		// per-write context-validity checks are therefore redundant. We
		// still confirm the header cache matches what `processQueue`
		// captured, in case a switch completed between the capture and
		// the cycle actually starting.
		const currentTeamAtStart = getActiveTeamId();
		if (currentTeamAtStart !== teamId) {
			// biome-ignore lint/suspicious/noConsole: cycle-start mismatch is a legitimate diagnostic
			console.warn(
				`[SyncOrchestrator] active team changed before cycle start (expected=${teamId}, got=${currentTeamAtStart}); aborting`,
			);
			return;
		}

		// Kick off file uploads in parallel — they don't need the sync
		// wave order and can run alongside the pull pipeline.
		void fileUploadWorker.run();

		// Set collects team ids the pull pipeline discovered are gone
		// (team-deleted tombstone or self-membership-revoked tombstone).
		// Populated inline by `pullTeamsApp` and `pullTable("teamMembers")`;
		// drained AFTER the pull pipeline completes and BEFORE the push
		// pipeline runs so we never push mutations for a wiped team.
		const teamsToWipe = new Set<string>();

		// Wave 1 — anchor: mints `topLevelSyncedAt` and pulls team rows.
		const topLevelSyncedAt = await this.pullTeamsApp(teamId, teamsToWipe);

		// The push pipeline used to run in parallel with the pull pipeline,
		// but wipe-driven tombstones force serialisation: we cannot start
		// pushing until we know which teams (if any) are gone. Doing this
		// serially costs one extra round-trip on the happy path — an
		// acceptable price to avoid pushing writes to a team the user was
		// just booted from.
		await this.runPullPipeline(teamId, topLevelSyncedAt, teamsToWipe);
		await this.processTeamWipes(teamId, teamsToWipe);
		await this.runPushPipeline(teamId);
	}

	// ─── Team-wipe handling ────────────────────────────────────────────

	/**
	 * Drain the `teamsToWipe` set: for each team, purge every local trace
	 * (rows + OPFS blobs) via `wipeTeamDataFromDb`. If the currently-
	 * active team is in the set, broadcast on `active-team-wiped` so the
	 * main thread can drive the switch-gate flow — the orchestrator
	 * itself has no access to the router revalidator or the React Query
	 * cache, so it cannot perform the switch here.
	 */
	private async processTeamWipes(
		activeTeamId: string,
		teamsToWipe: Set<string>,
	): Promise<void> {
		if (teamsToWipe.size === 0) return;

		let activeTeamWiped = false;
		for (const wipedTeamId of teamsToWipe) {
			try {
				await wipeTeamDataFromDb(wipedTeamId);
				if (wipedTeamId === activeTeamId) activeTeamWiped = true;
			} catch (err) {
				// biome-ignore lint/suspicious/noConsole: same rationale as other pull failures
				console.warn(`[SyncOrchestrator] wipe for team ${wipedTeamId} failed`, err);
			}
		}

		if (activeTeamWiped) {
			// Clear the worker-side cache immediately so the current cycle's
			// remaining work doesn't try to write against a wiped team.
			_setActiveTeamId(null);
			const msg: ActiveTeamWipedMessage = {
				type: "active-team-wiped",
				wipedTeamId: activeTeamId,
			};
			try {
				activeTeamWipedChannel?.postMessage(msg);
			} catch (err) {
				// biome-ignore lint/suspicious/noConsole: broadcast failures should surface in devtools
				console.warn("[SyncOrchestrator] failed to broadcast active-team-wiped", err);
			}
		}
	}

	// ─── Pull pipeline ─────────────────────────────────────────────────

	private async pullTeamsApp(
		teamId: string,
		teamsToWipe: Set<string>,
	): Promise<number> {
		const cursor = await syncMetadataDb.getCursor("teamsApp", teamId);
		const res = await orpcFetch.teams.pullBundles({
			syncMetadata: cursor ?? null,
		});
		await teamsAppDb.bulkUpsert(res.rows);
		this.collectTeamTombstones(res.rows, teamsToWipe);
		await syncMetadataDb.saveCursor("teamsApp", teamId, res.syncMetadata);
		await syncMetadataDb.saveTopLevelSyncedAt(teamId, res.topLevelSyncedAt);
		return res.topLevelSyncedAt;
	}

	private async runPullPipeline(
		teamId: string,
		topLevelSyncedAt: number,
		teamsToWipe: Set<string>,
	): Promise<void> {
		// Waves after the anchor. Run sequentially — order preserves the
		// dependency: team members reference teams, journal entries
		// reference teams and members, files reference journal entries.
		for (const table of this.WAVE_ORDER) {
			if (table === "teamsApp") continue;
			try {
				await this.pullTable(table, teamId, topLevelSyncedAt, teamsToWipe);
			} catch (err) {
				// biome-ignore lint/suspicious/noConsole: table-level failures shouldn't kill the whole cycle
				console.warn(`[SyncOrchestrator] pull ${table} failed`, err);
			}
		}
	}

	private async pullTable(
		table: TablesToSync,
		teamId: string,
		topLevelSyncedAt: number,
		teamsToWipe: Set<string>,
	): Promise<void> {
		const cursor = await syncMetadataDb.getCursor(table, teamId);
		const input = {
			syncMetadata: cursor ?? null,
			topLevelSyncedAt,
		};

		if (table === "teamMembers") {
			const res = await orpcFetch.teams.pullMembersDelta(input);
			await teamMembersDb.bulkUpsert(res.rows);
			this.collectSelfMembershipTombstones(res.rows, teamsToWipe);
			await syncMetadataDb.saveCursor(table, teamId, res.syncMetadata);
			return;
		}
		if (table === "prompts") {
			const res = await orpcFetch.prompts.pullBundles(input);
			await promptsDb.bulkUpsert(res.rows);
			await syncMetadataDb.saveCursor(table, teamId, res.syncMetadata);
			return;
		}
		if (table === "journalEntries") {
			const res = await orpcFetch.journalEntries.pullBundles(input);
			await journalEntriesDb.bulkUpsertFromServer(res.rows);
			await syncMetadataDb.saveCursor(table, teamId, res.syncMetadata);
			return;
		}
		if (table === "files") {
			const res = await orpcFetch.files.pullBundles(input);
			await filesDb.bulkUpsertFromServer(res.rows);
			await syncMetadataDb.saveCursor(table, teamId, res.syncMetadata);
			return;
		}
	}

	/**
	 * Every `teams` row with a non-null `deletedAt` is a tombstone —
	 * server-side, the team was soft-deleted. The client has been
	 * `bulkUpsert`ing the tombstone into `teamsApp`; we now flag it for
	 * wipe so the rest of its local footprint (members, journal entries,
	 * files, OPFS blobs, sync cursors) goes with it.
	 */
	private collectTeamTombstones(
		rows: TeamAppSelectAll[],
		teamsToWipe: Set<string>,
	): void {
		for (const row of rows) {
			if (row.deletedAt !== null) teamsToWipe.add(row.id);
		}
	}

	/**
	 * A tombstoned `team_members` row belonging to the CURRENT user is
	 * the "you were removed" signal. Rows for OTHER users' removals are
	 * ignored — those get evicted by the bulkUpsert but the team itself
	 * is still alive for us.
	 */
	private collectSelfMembershipTombstones(
		rows: TeamAppMemberSelectAll[],
		teamsToWipe: Set<string>,
	): void {
		const selfUserId = this.initialisedForUserId;
		if (!selfUserId) return;
		for (const row of rows) {
			if (row.deletedAt !== null && row.userId === selfUserId) {
				teamsToWipe.add(row.teamId);
			}
		}
	}

	// ─── Push pipeline ─────────────────────────────────────────────────

	private async runPushPipeline(teamId: string): Promise<void> {
		try {
			await this.pushJournalEntryCreates(teamId);
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: same rationale as pull failures
			console.warn("[SyncOrchestrator] pushJournalEntryCreates failed", err);
		}
		try {
			await this.pushFileCdnUpdates();
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: intentional — surface push failure so devs know CDN upgrade path stalled
			console.warn("[SyncOrchestrator] pushFileCdnUpdates failed", err);
		}
	}

	private async pushJournalEntryCreates(teamId: string): Promise<void> {
		const allPending = await journalEntriesDb.getPending(teamId);
		// Skip entries the user is actively editing — pushing mid-edit
		// would race the keystrokes and echo back a stale server row.
		const pending = pendingEditLockRegistry.filterUnlocked(
			"journalEntries",
			allPending,
		);
		if (pending.length === 0) return;

		// Bundle each pending entry with its nested files. Files are the
		// LOCAL rows attached to this journal entry.
		// `teamId` on the parent is NOT sent — the server derives it from
		// `ctx.activeTeamId` so a client can't relocate an entry to another
		// tenant. The push route is already gated by `activeTeamId`, so this
		// is the correct authority.
		const creates = await Promise.all(
			pending.map(async (entry) => {
				const localFiles = await filesDb.getAllForParent("journalEntries", entry.id);
				return {
					id: entry.id,
					content: entry.content,
					prompt: entry.prompt,
					promptId: entry.promptId,
					deletedAt: entry.deletedAt,
					files: localFiles.map((f) => ({
						id: f.id,
						tableName: f.tableName,
						tableId: f.tableId,
						type: f.type,
						fileName: f.fileName,
						mimeType: f.mimeType,
						teamId: f.teamId,
						deletedAt: f.deletedAt,
						isMainFileLost: f.isMainFileLost,
						// cdnUrl / thumbnailCdnUrl are patched later via pushCdnUpdates.
						cdnUrl: null,
						thumbnailCdnUrl: null,
					})),
				};
			}),
		);

		const sentIds = creates.map((c) => c.id);
		const res = await orpcFetch.journalEntries.pushCreates({ creates });

		const ackedIds = new Set<string>();
		for (const result of res.results) {
			ackedIds.add(result.id);
			if (result.ok && result.row) {
				await journalEntriesDb.overwriteFromServer(result.row);
			} else if (!result.ok) {
				await journalEntriesDb.setSyncError(result.id, result.error ?? "unknown error");
			}
		}

		// Coverage check: any id we sent but the server did not acknowledge
		// is a silent drop — without this, the row stays pending forever
		// and we send it again every cycle. Marking it with a syncError
		// surfaces it in the sync-status UI so the user can retry or delete.
		for (const id of sentIds) {
			if (!ackedIds.has(id)) {
				await journalEntriesDb.setSyncError(
					id,
					"Server did not acknowledge this push",
				);
			}
		}
	}

	private async pushFileCdnUpdates(): Promise<void> {
		const rows = await filesDb.getCdnUpdatesNeedingPush();
		if (rows.length === 0) return;

		// Belt-and-suspenders. The state gate (`uploaded_to_cdn`) alone
		// was NOT enough historically: a pull cycle could clobber the
		// local URL between "worker sets uploaded_to_cdn" and "push runs",
		// leaving the state gate open but the URL null → push sent
		// `{id}` only → server-side row stayed null forever.
		// `filesDb.bulkUpsertFromServer` now null-coalesces the URL so
		// the clobber can't happen — but we keep the state gate here
		// too so a regression on either side degrades to "no-op push"
		// rather than "silently sends null and marks state advanced".
		const updates = rows.map((r) => ({
			id: r.id,
			cdnUrl: r.mainUploadState === "uploaded_to_cdn" ? r.cdnUrl ?? undefined : undefined,
			thumbnailCdnUrl:
				r.thumbnailUploadState === "uploaded_to_cdn" ? r.thumbnailCdnUrl ?? undefined : undefined,
			isMainFileLost: r.isMainFileLost === true ? true : undefined,
		}));

		const res = await orpcFetch.files.pushCdnUpdates({ updates });

		for (const result of res.results) {
			const row = rows.find((r) => r.id === result.id);
			if (!row) continue;
			if (!result.ok) {
				await filesDb.setSyncError(result.id, result.error ?? "unknown error");
				continue;
			}
			// On ok, promote the per-layer state from `uploaded_to_cdn` to
			// `uploaded` for whichever layers we pushed.
			if (row.mainUploadState === "uploaded_to_cdn") {
				await filesDb.markCdnPushed(result.id, "main");
			}
			if (row.thumbnailUploadState === "uploaded_to_cdn") {
				await filesDb.markCdnPushed(result.id, "thumbnail");
			}
			await filesDb.setSyncError(result.id, null);
		}
	}
}

export const syncOrchestrator: SyncOrchestratorApi = new SyncOrchestrator();
