import { ulid } from "ulid";
import { env } from "../configs/env.config";

/**
 * Sanitizes a filename to be safe for S3 storage.
 * Removes non-alphanumeric characters except for dots, dashes, and underscores.
 */
const sanitizeFileName = (fileName: string): string => {
	return fileName
		.replace(/[^a-zA-Z0-9.\-_]/g, "_")
		.replace(/_{2,}/g, "_")
		.toLowerCase();
};

/**
 * Generates a unique S3 key for a file.
 * Format: [companyId/][resourceType/][ulid]_[sanitizedFileName]
 */
export const generateS3Key = (options: {
	fileName: string;
	folderName?: string;
	resourceType?: string;
	id?: string;
}): string => {
	const safeFileName = sanitizeFileName(options.fileName);
	const folderPrefix = options.folderName ? `${options.folderName}/` : "";
	const resourcePrefix = options.resourceType ? `${options.resourceType}/` : "";
	const id = options.id || ulid();

	return `${folderPrefix}${resourcePrefix}${id}_${safeFileName}`;
};

/**
 * Generates a public CDN/Preview URL for a given S3 key.
 */
export const generatePublicUrl = (key: string): string => {
	if (env.S3_PUBLIC_URL) {
		// If a custom public URL is provided (e.g., Cloudflare R2 custom domain)
		const baseUrl = env.S3_PUBLIC_URL.endsWith("/") ? env.S3_PUBLIC_URL : `${env.S3_PUBLIC_URL}/`;
		return `${baseUrl}${key}`;
	}

	// Fallback to standard S3 endpoint format
	const baseUrl = env.S3_ENDPOINT.endsWith("/") ? env.S3_ENDPOINT : `${env.S3_ENDPOINT}/`;
	return `${baseUrl}${env.S3_BUCKET_NAME}/${key}`;
};

/**
 * The object key behind a public URL `generatePublicUrl` produced, or null
 * when the URL is not on this bucket (another host, an older bucket). Both
 * forms are recognised so rows written before S3_PUBLIC_URL was set resolve.
 */
export const objectKeyFromPublicUrl = (url: string): string | null => {
	const bases = [env.S3_PUBLIC_URL, `${env.S3_ENDPOINT.replace(/\/+$/, "")}/${env.S3_BUCKET_NAME}`]
		.filter((b): b is string => Boolean(b))
		.map((b) => (b.endsWith("/") ? b : `${b}/`));
	for (const base of bases) {
		if (url.startsWith(base)) {
			let key: string;
			try {
				key = decodeURIComponent(url.slice(base.length).split(/[?#]/)[0] ?? "");
			} catch {
				return null;
			}
			return key.length > 0 ? key : null;
		}
	}
	return null;
};
