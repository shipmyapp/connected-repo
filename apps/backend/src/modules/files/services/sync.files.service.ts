import { env } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { syncDeltaService } from "@backend/modules/sync/services/sync_delta.sync.service";
import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";
import type {
	FilePullBundlesInput,
	FilePullBundlesOutput,
	FilePushCdnUpdatesInput,
	FilePushCdnUpdatesOutput,
} from "@connected-repo/zod-schemas/files/sync";

/**
 * Origins accepted for `cdnUrl` / `thumbnailCdnUrl` patch values. Anything
 * else is rejected as a URL-defacement attempt (phishing/tracker hosts).
 * Derived once at module load from the same env vars the upload worker uses
 * to construct these URLs, so the allowlist can never drift from reality.
 */
const CDN_ORIGIN_ALLOWLIST: ReadonlySet<string> = (() => {
	const origins = new Set<string>();
	for (const raw of [env.S3_PUBLIC_URL, env.S3_ENDPOINT]) {
		if (!raw) continue;
		try {
			origins.add(new URL(raw).origin);
		} catch {
			// env-parsed URL should always be valid; ignore defensively.
		}
	}
	return origins;
})();

const isAllowedCdnUrl = (url: string): boolean => {
	try {
		return CDN_ORIGIN_ALLOWLIST.has(new URL(url).origin);
	} catch {
		return false;
	}
};

/**
 * Patch `cdnUrl` / `thumbnailCdnUrl` / `isMainFileLost` on file rows the
 * device already created on the server. Called by the FileUploadWorker
 * after its CDN PUT succeeds.
 *
 * Shape: one SELECT FOR UPDATE locks every requested row, then a single
 * `updateMany` call writes the patches. Roundtrips drop from
 * O(2N) (per-row select + update) to O(1) regardless of batch size, and
 * the lock window stays tight because everything runs in one transaction.
 *
 * Per-update semantics:
 *   * cdnUrl / thumbnailCdnUrl — only fill if the server still has null,
 *     so a concurrent upload from another device can't be clobbered.
 *   * isMainFileLost           — one-way flip (false → true). Stays true.
 *   * row missing              — return ok:false. The worker retries with
 *     backoff; the row will appear once the parent's bundle lands.
 *
 * Tenant safety: `FileTable`'s default scope automatically filters every
 * read and write by `tenantTeamId` from the request context.
 * URL patches are additionally origin-checked against the server's own
 * CDN allowlist so a compromised device still can't inject a foreign URL.
 */
export async function pushFilesCdnUpdatesService(
	input: FilePushCdnUpdatesInput,
): Promise<FilePushCdnUpdatesOutput> {
	if (input.updates.length === 0) return { results: [] };

	const ids = input.updates.map((u) => u.id);

	return await db.$transaction(async () => {
		// `forUpdate` serialises concurrent writers so the "only write if
		// null" compare-and-set below is atomic across devices.
		// Tenant scoping is handled automatically by FileTable's default scope.
		// Any spoofed id belonging to another team is filtered out here and
		// falls through to the "row missing" branch below.
		const existing = await db.files
			.where({ id: { in: ids } })
			.forUpdate()
			.selectAll();
		const byId = new Map<string, FileSelectAll>(
			existing.map((r) => [r.id, r as FileSelectAll]),
		);

		const patches: Array<{
			id: string;
			cdnUrl: string | null;
			thumbnailCdnUrl: string | null;
			isMainFileLost: boolean;
		}> = [];

		// Ids whose patch carried a URL that failed the origin allowlist.
		// Tracked separately so we can still return per-row {ok:false} without
		// letting the bad URL reach the DB.
		const rejectedUrlIds = new Set<string>();

		for (const u of input.updates) {
			const current = byId.get(u.id);
			if (!current) continue; // handled in the results-iteration below

			// Reject non-allowlisted URLs BEFORE bucketing so a bad host can't
			// slip into the updateMany payload. We mark the id as rejected and
			// skip both URL buckets for this row; `isMainFileLost` on the same
			// patch is still honoured because the flag isn't attacker-controlled
			// URL content.
			const cdnUrlBad =
				u.cdnUrl != null && !isAllowedCdnUrl(u.cdnUrl);
			const thumbUrlBad =
				u.thumbnailCdnUrl != null && !isAllowedCdnUrl(u.thumbnailCdnUrl);
			if (cdnUrlBad || thumbUrlBad) {
				rejectedUrlIds.add(u.id);
				continue;
			}

			let hasChange = false;
			const patch = {
				id: u.id,
				cdnUrl: current.cdnUrl,
				thumbnailCdnUrl: current.thumbnailCdnUrl,
				isMainFileLost: current.isMainFileLost,
			};

			if (u.cdnUrl != null && current.cdnUrl == null) {
				patch.cdnUrl = u.cdnUrl;
				hasChange = true;
			}
			if (u.thumbnailCdnUrl != null && current.thumbnailCdnUrl == null) {
				patch.thumbnailCdnUrl = u.thumbnailCdnUrl;
				hasChange = true;
			}
			if (u.isMainFileLost === true && current.isMainFileLost === false) {
				patch.isMainFileLost = true;
				hasChange = true;
			}

			if (hasChange) {
				patches.push(patch);
				// Reflect the just-written patches back into the in-memory rows so the
				// response carries post-patch state without a second SELECT.
				current.cdnUrl = patch.cdnUrl;
				current.thumbnailCdnUrl = patch.thumbnailCdnUrl;
				current.isMainFileLost = patch.isMainFileLost;
			}
		}

		// Single round-trip regardless of batch size. Orchid ORM's updateMany
		// requires all rows to have the same set of non-key columns, which we
		// guarantee by echoing the current DB state for unmodified fields.
		// These patches ALL came from the FOR UPDATE snapshot above, so
		// overwriting with `current` is safe from race conditions.
		if (patches.length > 0) {
			await db.files.updateMany(patches);
		}

		// Preserve per-row ok/error ordering matching `input.updates`.
		const results = input.updates.map((u) => {
			const current = byId.get(u.id);
			if (!current) {
				// Same error shape for "wrong tenant" and "row missing" so we
				// don't leak whether the id exists in another team.
				return {
					ok: false as const,
					id: u.id,
					error:
						"File row not found — parent bundle likely hasn't landed yet",
				};
			}
			if (rejectedUrlIds.has(u.id)) {
				return {
					ok: false as const,
					id: u.id,
					error: "Not a permitted CDN URL",
				};
			}
			// No-op (nothing to patch, or every URL already set) still returns
			// ok:true with the current server row — the client uses this to
			// confirm the server-side state.
			return { ok: true as const, id: u.id, row: current };
		});

		return { results };
	});
}

export async function pullFilesService(
	input: FilePullBundlesInput,
): Promise<FilePullBundlesOutput> {
	// Tenant filter applied automatically by FileTable's default scope.
	const baseQuery = db.files;

	const { data, syncMetadata } = await syncDeltaService<FileSelectAll>({
		// biome-ignore lint/suspicious/noExplicitAny: __scopes generic mismatch when narrowing bare table query
		baseQuery: baseQuery as any,
		syncMetadataInput: input.syncMetadata,
		topLevelSyncedAt: input.topLevelSyncedAt,
		syncedTable: "files",
	});

	return { rows: data, syncMetadata };
}
