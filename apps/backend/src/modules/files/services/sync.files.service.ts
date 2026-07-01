import { db } from "@backend/db/db";
import { syncDeltaService } from "@backend/modules/sync/services/sync_delta.sync.service";
import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";
import type {
	FilePullBundlesInput,
	FilePullBundlesOutput,
	FilePushCdnUpdateResult,
	FilePushCdnUpdatesInput,
	FilePushCdnUpdatesOutput,
} from "@connected-repo/zod-schemas/files/sync";

/**
 * Patch `cdnUrl` / `thumbnailCdnUrl` / `isMainFileLost` on file rows the
 * device already created on the server. Called by the FileUploadWorker
 * after its CDN PUT succeeds.
 *
 * Locks every requested row inside one transaction (`forUpdate`), buckets
 * the patches by field, then writes each bucket. Cross-device concurrency:
 * URL fields are only written if the server column is still null — a
 * completed upload from another device cannot be clobbered. `isMainFileLost`
 * is a one-way flip.
 */
export async function pushFilesCdnUpdatesService(
	input: FilePushCdnUpdatesInput,
): Promise<FilePushCdnUpdatesOutput> {
	if (input.updates.length === 0) return { results: [] };

	const ids = input.updates.map((u) => u.id);
	const results: FilePushCdnUpdateResult[] = [];

	await db.$transaction(async () => {
		// `forUpdate` serialises concurrent writers so the "only write if
		// null" compare-and-set below is atomic across devices.
		const existing = await db.files
			.where({ id: { in: ids } })
			.forUpdate()
			.selectAll();
		const byId = new Map<string, FileSelectAll>(
			existing.map((r) => [r.id, r as FileSelectAll]),
		);

		for (const patch of input.updates) {
			const current = byId.get(patch.id);
			if (!current) {
				results.push({
					ok: false,
					id: patch.id,
					error: "File row not found — parent bundle likely hasn't landed yet",
				});
				continue;
			}

			const cols: Record<string, unknown> = {};
			if (patch.cdnUrl && current.cdnUrl == null) cols.cdnUrl = patch.cdnUrl;
			if (patch.thumbnailCdnUrl && current.thumbnailCdnUrl == null) {
				cols.thumbnailCdnUrl = patch.thumbnailCdnUrl;
			}
			if (patch.isMainFileLost === true && current.isMainFileLost === false) {
				cols.isMainFileLost = true;
			}

			// UPDATE ... RETURNING skips the refetch. If nothing changed
			// (no-op patch), echo the pre-image we already have locked.
			const row =
				Object.keys(cols).length > 0
					? ((await db.files
							.find(patch.id)
							.selectAll()
							.update(cols)) as FileSelectAll)
					: current;
			results.push({ ok: true, id: patch.id, row });
		}
	});

	return { results };
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
