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

// Producer-side channel for the "your active team is gone" signal.
// Guarded because unit-test environments may lack `BroadcastChannel`.
const activeTeamWipedChannel: BroadcastChannel | null =
	typeof BroadcastChannel !== "undefined"
		? new BroadcastChannel(ACTIVE_TEAM_WIPED_CHANNEL)
		: null;

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
	processQueue(): Promise<void>;
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
 * Trigger sources (replacing the SSE trigger from pre-pivot):
 *   1. `visibilitychange` / `focus` on the main thread.
 *   2. Browser `online` event.
 *   3. Post-write kick from `OnlineFirstAdapter` when fallback occurs.
 *   4. `subscribe()` DB-write callback in this worker.
 *   5. Slow interval (60s) as a safety net.
 */
class SyncOrchestrator implements SyncOrchestratorApi {
	private isProcessing = false;
	private needsRescan = false;
	private intervalHandle: ReturnType<typeof setInterval> | null = null;
	private initialisedForUserId: string | null = null;

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

		// Clear active team on user switch — the main thread will push
		// the fresh team id in via `setActiveTeamId` after user login.
		_setActiveTeamId(null);

		if (this.intervalHandle) return; // triggers already registered

		// Trigger #4: any local write fans out here via BroadcastChannel.
		//
		// Two guards keep this from ping-ponging with our own writes:
		//
		// 1. `teamsApp` / `teamMembers` aren't listened for at all — the
		//    only writers to those Dexie tables are our own pull pipeline
		//    and `wipeTeamDataFromDb`, both invoked from inside a running
		//    cycle. Listening for them guaranteed a self-trigger every
		//    cycle.
		// 2. For `journalEntries` / `files` — which CAN be user-written —
		//    ignore notifications while `isProcessing` is set. Those
		//    fire from our own bulkUpsert/overwrite calls during a cycle.
		//    User writes that land during a cycle are still covered: the
		//    main thread's post-write kick calls `processQueue()` directly
		//    via Comlink, which sets `needsRescan` from inside the method
		//    itself; the 60s interval is a further safety net.
		subscribe((table) => {
			if (this.isProcessing) return;
			if (table === "journalEntries" || table === "files") {
				this.processQueue();
			}
		});

		// Trigger #2: browser `online` event fires in the worker context too.
		self.addEventListener("online", () => {
			this.processQueue();
		});

		// Trigger #5: safety-net interval.
		this.intervalHandle = setInterval(() => {
			this.processQueue();
		}, 60_000);
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
	 */
	async processQueue(): Promise<void> {
		if (this.isProcessing) {
			this.needsRescan = true;
			return;
		}
		if (!this.initialisedForUserId) return; // pre-login
		if (!self.navigator?.onLine) return;

		const teamId = getActiveTeamId();
		if (!teamId) return; // no active team → nothing to sync

		this.isProcessing = true;
		this.needsRescan = false;
		await syncMetadataDb.saveCycleState({ lastAttemptedAt: Date.now() });

		try {
			await this.runCycle(teamId);
			await syncMetadataDb.saveCycleState({
				lastCompletedAt: Date.now(),
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
			if (this.needsRescan) {
				this.needsRescan = false;
				void this.processQueue();
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
		const pending = await journalEntriesDb.getPending(teamId);
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

		const res = await orpcFetch.journalEntries.pushCreates({ creates });

		for (const result of res.results) {
			if (result.ok && result.row) {
				await journalEntriesDb.overwriteFromServer(result.row);
			} else if (!result.ok) {
				await journalEntriesDb.setSyncError(result.id, result.error ?? "unknown error");
			}
		}
	}

	private async pushFileCdnUpdates(): Promise<void> {
		const rows = await filesDb.getCdnUpdatesNeedingPush();
		if (rows.length === 0) return;

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
