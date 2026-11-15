/**
 * Utility for managing blobs in the Origin Private File System.
 *
 * OPFS gives us a sandboxed, per-origin filesystem that survives page
 * reloads but is invisible to the user. We keep every pending upload
 * blob here so that IndexedDB rows stay lean and we can rehydrate blobs
 * across worker/tab boundaries without shuttling bytes through
 * `postMessage`.
 */
let rootPromise: Promise<FileSystemDirectoryHandle> | null = null;

function getRoot(): Promise<FileSystemDirectoryHandle> {
	if (!rootPromise) {
		rootPromise = navigator.storage.getDirectory();
	}
	return rootPromise;
}

export const OPFSManager = {
	async saveFile(path: string, blob: Blob): Promise<void> {
		const root = await getRoot();
		const parts = path.split("/");
		const fileName = parts.pop();
		if (!fileName) throw new Error(`OPFS: invalid path ${path}`);

		let currentDir = root;
		for (const part of parts) {
			currentDir = await currentDir.getDirectoryHandle(part, { create: true });
		}

		const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(blob);
		await writable.close();
	},

	async readFile(path: string): Promise<Blob | null> {
		try {
			const root = await getRoot();
			const parts = path.split("/");
			const fileName = parts.pop();
			if (!fileName) return null;

			let currentDir = root;
			for (const part of parts) {
				currentDir = await currentDir.getDirectoryHandle(part);
			}

			const fileHandle = await currentDir.getFileHandle(fileName);
			return await fileHandle.getFile();
		} catch (error) {
			// OPFS read misses are recoverable — the CDN-first path takes over
			console.warn(`[OPFS] Failed to read file at ${path}:`, error);
			return null;
		}
	},

	async deleteFile(path: string): Promise<void> {
		try {
			const root = await getRoot();
			const parts = path.split("/");
			const fileName = parts.pop();
			if (!fileName) return;

			let currentDir = root;
			for (const part of parts) {
				currentDir = await currentDir.getDirectoryHandle(part);
			}

			await currentDir.removeEntry(fileName);
		} catch (error) {
			// same as above
			console.warn(`[OPFS] Failed to delete file at ${path}:`, error);
		}
	},

	/**
	 * Recursively remove a directory (and all files under it) from OPFS.
	 * Used on user-switch to blast the entire per-origin `files/` tree so
	 * the incoming user never sees the previous user's blob residency.
	 */
	async wipeDirectory(path: string): Promise<void> {
		try {
			const root = await getRoot();
			const parts = path.split("/").filter(Boolean);
			if (parts.length === 0) return;

			const dirName = parts.pop();
			if (!dirName) return;

			let currentDir = root;
			for (const part of parts) {
				currentDir = await currentDir.getDirectoryHandle(part);
			}

			await currentDir.removeEntry(dirName, { recursive: true });
		} catch (error) {
			// OPFS wipe misses are recoverable — the DB drop still fires
			console.warn(`[OPFS] Failed to wipe directory at ${path}:`, error);
		}
	},

	async calculateChecksum(blob: Blob): Promise<string> {
		const arrayBuffer = await blob.arrayBuffer();
		const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	},
};
