/**
 * Trigger a browser "Save as" for an in-memory blob. Used by the sync-status
 * page so the user can rescue un-synced data (offline-created files + entry
 * text) to their device before discarding it — the "no data is ever lost"
 * guarantee for the offline flow.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Revoke after a delay so the download has time to start.
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Serialize a value to a pretty-printed JSON file and download it. */
export function downloadJson(data: unknown, fileName: string): void {
	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: "application/json",
	});
	downloadBlob(blob, fileName);
}

/** Filesystem-safe filename fragment. */
export function safeFileName(name: string): string {
	return name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120) || "file";
}
