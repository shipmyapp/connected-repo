/**
 * Origin Private File System (OPFS) Storage Helper
 * 
 * Provides a high-performance, persistent storage mechanism for large binary blobs
 * (images, videos, etc.) that avoids the overhead and eviction risks of IndexedDB.
 */

/**
 * Saves a Blob to OPFS at the specified path.
 * Paths are relative to the OPFS root and should be forward-slash separated.
 */
export async function saveToOpfs(path: string, blob: Blob): Promise<void> {
	const parts = path.split("/");
	const fileName = parts.pop()!;
	
	let currentDir = await navigator.storage.getDirectory();
	
	// Create/Traverse directory structure
	for (const part of parts) {
		currentDir = await currentDir.getDirectoryHandle(part, { create: true });
	}

	// Get file handle and write content
	const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
	const writable = await fileHandle.createWritable();
	await writable.write(blob);
	await writable.close();
}

/**
 * Retrieves a Blob from OPFS at the specified path.
 * Returns null if the file does not exist.
 */
export async function getFromOpfs(path: string): Promise<Blob | null> {
	try {
		const parts = path.split("/");
		const fileName = parts.pop()!;
		
		let currentDir = await navigator.storage.getDirectory();
		
		for (const part of parts) {
			currentDir = await currentDir.getDirectoryHandle(part);
		}

		const fileHandle = await currentDir.getFileHandle(fileName);
		return await fileHandle.getFile();
	} catch (error) {
		// Return null if path or file doesn't exist
		return null;
	}
}

/**
 * Deletes a file from OPFS at the specified path.
 */
export async function deleteFromOpfs(path: string): Promise<void> {
	try {
		const parts = path.split("/");
		const fileName = parts.pop()!;
		
		let currentDir = await navigator.storage.getDirectory();
		
		for (const part of parts) {
			currentDir = await currentDir.getDirectoryHandle(part);
		}

		await currentDir.removeEntry(fileName);
	} catch (error) {
		// Ignore if file already gone
	}
}

/**
 * Generates a virtual URL for a file in OPFS.
 * This URL is intercepted by the Service Worker for high-performance serving.
 */
export function getOpfsVirtualUrl(path: string): string {
	return `/opfs-media/${path}`;
}
