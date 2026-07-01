import type { TablesToSync } from "@connected-repo/zod-schemas/enums.zod";
import { journalEntriesDb } from "../../modules/journal-entries/worker/journal-entries.db";
import { promptsDb } from "../../modules/prompts/worker/prompts.db";
import { orpcFetch } from "../../utils/orpc.client";
import { initDb } from "../db/db.lifecycle";
import { subscribe } from "../db/db.manager";
import { filesDb } from "../db/files.db";
import { syncMetadataDb } from "../db/sync_metadata.db";
import { wipeTeamData } from "../db/team_data.wipe";
import { teamMembersDb } from "../db/team_members.db";
import { teamsAppDb } from "../db/teams_app.db";
import { setActiveTeamId as _setActiveTeamId, getActiveTeamId } from "./active_team";
import { fileUploadWorker } from "./file_upload.worker";

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
	wipeTeamData(teamId: string): Promise<void>;
	processQueue(): Promise<void>;
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
		if (this.initialisedForUserId === userId) return;

		await initDb(userId);
		this.initialisedForUserId = userId;

		// Clear active team on user switch — the main thread will push
		// the fresh team id in via `setActiveTeamId` after user login.
		_setActiveTeamId(null);

		if (this.intervalHandle) return; // triggers already registered

		// Trigger #4: any local write fans out here via BroadcastChannel.
		subscribe((table) => {
			if (
				table === "journalEntries" ||
				table === "files" ||
				table === "teamsApp" ||
				table === "teamMembers"
			) {
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

	setActiveTeamId(id: string | null): void {
		_setActiveTeamId(id);
		if (id) this.processQueue();
	}

	/**
	 * Purge every local trace of a team. Called when the user leaves a
	 * team on the server (removed by an admin, or self-leaves). If the
	 * wiped team was active, callers should follow up with
	 * `setActiveTeamId(newTeamId)` before the next trigger fires.
	 */
	async wipeTeamData(teamId: string): Promise<void> {
		await wipeTeamData(teamId);
		if (getActiveTeamId() === teamId) {
			_setActiveTeamId(null);
		}
	}

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
		const expectedUserId = this.initialisedForUserId;
		if (!expectedUserId) return;

		// Kick off file uploads in parallel — they don't need the sync
		// wave order and can run alongside the pull pipeline.
		void fileUploadWorker.run();

		// Wave 1 — anchor: mints `topLevelSyncedAt` and pulls team rows.
		const topLevelSyncedAt = await this.pullTeamsApp(teamId, expectedUserId);
		if (topLevelSyncedAt === null) return; // DB swapped, abort cycle.

		// Push and pull run as two parallel pipelines walking the remaining
		// waves. Match the tezi model: `Future.wait([push, pull])`.
		await Promise.all([
			this.runPushPipeline(teamId, expectedUserId),
			this.runPullPipeline(teamId, topLevelSyncedAt, expectedUserId),
		]);
	}

	// ─── Pull pipeline ─────────────────────────────────────────────────

	private async pullTeamsApp(teamId: string, expectedUserId: string): Promise<number | null> {
		const cursor = await syncMetadataDb.getCursor("teamsApp", teamId);
		const res = await orpcFetch.teams.pullBundles({
			syncMetadata: cursor ?? null,
		});
		if (this.initialisedForUserId !== expectedUserId) return null;
		await teamsAppDb.bulkUpsert(res.rows);
		await syncMetadataDb.saveCursor("teamsApp", teamId, res.syncMetadata);
		await syncMetadataDb.saveTopLevelSyncedAt(teamId, res.topLevelSyncedAt);
		return res.topLevelSyncedAt;
	}

	private async runPullPipeline(teamId: string, topLevelSyncedAt: number, expectedUserId: string): Promise<void> {
		// Waves after the anchor. Run sequentially — order preserves the
		// dependency: team members reference teams, journal entries
		// reference teams and members, files reference journal entries.
		for (const table of this.WAVE_ORDER) {
			if (table === "teamsApp") continue;
			try {
				await this.pullTable(table, teamId, topLevelSyncedAt, expectedUserId);
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
		expectedUserId: string,
	): Promise<void> {
		const cursor = await syncMetadataDb.getCursor(table, teamId);
		const input = {
			syncMetadata: cursor ?? null,
			topLevelSyncedAt,
		};

		if (table === "teamMembers") {
			const res = await orpcFetch.teams.pullMembersDelta(input);
			if (this.initialisedForUserId !== expectedUserId) return;
			await teamMembersDb.bulkUpsert(res.rows);
			await syncMetadataDb.saveCursor(table, teamId, res.syncMetadata);
			return;
		}
		if (table === "prompts") {
			const res = await orpcFetch.prompts.pullBundles(input);
			if (this.initialisedForUserId !== expectedUserId) return;
			await promptsDb.bulkUpsert(res.rows);
			await syncMetadataDb.saveCursor(table, teamId, res.syncMetadata);
			return;
		}
		if (table === "journalEntries") {
			const res = await orpcFetch.journalEntries.pullBundles(input);
			if (this.initialisedForUserId !== expectedUserId) return;
			await journalEntriesDb.bulkUpsertFromServer(res.rows);
			await syncMetadataDb.saveCursor(table, teamId, res.syncMetadata);
			return;
		}
		if (table === "files") {
			const res = await orpcFetch.files.pullBundles(input);
			if (this.initialisedForUserId !== expectedUserId) return;
			await filesDb.bulkUpsertFromServer(res.rows);
			await syncMetadataDb.saveCursor(table, teamId, res.syncMetadata);
			return;
		}
	}

	// ─── Push pipeline ─────────────────────────────────────────────────

	private async runPushPipeline(teamId: string, expectedUserId: string): Promise<void> {
		try {
			await this.pushJournalEntryCreates(teamId, expectedUserId);
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: same rationale as pull failures
			console.warn("[SyncOrchestrator] pushJournalEntryCreates failed", err);
		}
		try {
			await this.pushFileCdnUpdates(expectedUserId);
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: intentional — surface push failure so devs know CDN upgrade path stalled
			console.warn("[SyncOrchestrator] pushFileCdnUpdates failed", err);
		}
	}

	private async pushJournalEntryCreates(teamId: string, expectedUserId: string): Promise<void> {
		const pending = await journalEntriesDb.getPending(teamId);
		if (pending.length === 0) return;

		// Bundle each pending entry with its nested files. Files are the
		// LOCAL rows attached to this journal entry.
		const creates = await Promise.all(
			pending.map(async (entry) => {
				const localFiles = await filesDb.getAllForParent("journalEntries", entry.id);
				return {
					id: entry.id,
					content: entry.content,
					prompt: entry.prompt,
					promptId: entry.promptId,
					teamId: entry.teamId,
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
		if (this.initialisedForUserId !== expectedUserId) return;

		for (const result of res.results) {
			if (result.ok && result.row) {
				await journalEntriesDb.overwriteFromServer(result.row);
			} else if (!result.ok) {
				await journalEntriesDb.setSyncError(result.id, result.error ?? "unknown error");
			}
		}
	}

	private async pushFileCdnUpdates(expectedUserId: string): Promise<void> {
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
		if (this.initialisedForUserId !== expectedUserId) return;

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
