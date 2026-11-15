import { orpcFetch } from "@frontend/utils/orpc.client";

export const IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Browser → CDN, one picture: ask the backend for a presigned PUT under the
 * team's own prefix, PUT the file straight to the bucket, and hand back the
 * public URL to store on the row. Nothing passes through the backend, and
 * the backend never sees a URL it did not mint — the row only ever stores
 * what `fetchUrl` returned.
 */
export async function uploadImage(file: File, resourceType: "branding"): Promise<string> {
	if (!file.type.startsWith("image/")) {
		throw new Error("Pick an image file (PNG, JPEG, WebP…).");
	}
	if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
		throw new Error("That image is over 10 MB. Export a smaller one.");
	}
	const { signedUrl, fetchUrl } = await orpcFetch.cdn.generatePresignedUrl({
		fileName: file.name,
		contentType: file.type,
		contentLength: file.size,
		resourceType,
	});
	const res = await fetch(signedUrl, {
		method: "PUT",
		headers: { "Content-Type": file.type, "Content-Length": String(file.size) },
		body: file,
	});
	if (!res.ok) {
		throw new Error(`Upload of ${file.name} failed (${res.status}).`);
	}
	return fetchUrl;
}
