import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@backend/configs/env.config";
import { generatePublicUrl, generateS3Key } from "@backend/utils/cdn.utils";
import { s3Client } from "@backend/utils/s3.client";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

// Strict allowlist for path segments used as S3 folder prefixes to prevent
// path traversal / cross-tenant writes. Applied to `resourceType` before it is
// concatenated into the S3 key.
const SAFE_PATH_SEGMENT = /^[a-z0-9_-]+$/;

// Maximum upload size in bytes (25 MB). Enforced at signing time via the
// signed Content-Length header — S3 rejects PUTs whose Content-Length does not
// match the value bound into the signature, so the caller cannot upload a
// larger payload than declared.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Allowlist of MIME types accepted by the presigner. Uploads outside this list
// are rejected before any signature is produced, preventing this endpoint from
// becoming a distribution channel for arbitrary attacker-controlled payloads.
const ALLOWED_CONTENT_TYPE_PREFIXES = [
	"image/",
	"video/",
	"audio/",
	"text/plain",
	"application/pdf",
	"application/json",
	"application/zip",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.",
	"application/vnd.ms-excel",
	"application/vnd.ms-powerpoint",
] as const;

// Types a browser runs, or renders as a page, when the object is opened from
// the bucket's public host. SVG is XML that can carry script, and the
// `image/` prefix would admit it.
const ACTIVE_CONTENT_TYPES: ReadonlySet<string> = new Set([
	"image/svg+xml",
	"text/html",
	"application/xhtml+xml",
	"text/xml",
	"application/xml",
	"text/javascript",
	"application/javascript",
]);

// The type is signed into the PUT exactly as given, so it must already be
// the bare, lower-case form a browser's File.type has: no parameters, no
// case variants that slip past the list above.
export const isAllowedContentType = (contentType: string): boolean => {
	if (contentType !== contentType.trim().toLowerCase() || contentType.includes(";")) {
		return false;
	}
	if (ACTIVE_CONTENT_TYPES.has(contentType)) return false;
	return ALLOWED_CONTENT_TYPE_PREFIXES.some((prefix) => contentType.startsWith(prefix));
};

// Fields shared by presign and file-existence lookups. Kept separate so the
// existence check does not have to lie about contentType / contentLength.
export const cdnFileLocatorInput = z.object({
	id: z.ulid().optional(),
	fileName: z.string().min(1),
	resourceType: z
		.string()
		.regex(SAFE_PATH_SEGMENT, {
			message:
				"resourceType must match ^[a-z0-9_-]+$ (lowercase alphanumerics, dashes, underscores)",
		})
		.default("media"),
});

export const generateUrlInput = cdnFileLocatorInput.extend({
	// contentType is required so we can enforce an allowlist before signing.
	contentType: z.string().min(1),
	// Client-declared upload size in bytes; bound into the signature so
	// oversized uploads cannot succeed even if the client lies at PUT time.
	contentLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export const generatePresignedUrlService = async (
	input: z.infer<typeof generateUrlInput>,
	userId: string,
	activeTeamId: string,
) => {
	if (!isAllowedContentType(input.contentType)) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Content type "${input.contentType}" is not allowed for upload.`,
		});
	}

	// The folder is derived on the server: the caller's active team, then the
	// caller. A member can write only under their own folder, so nobody can
	// replace a teammate's object, and pushCdnUpdates can tie a URL to the
	// row's creator.
	const key = generateS3Key({
		folderName: `${activeTeamId}/${userId}`,
		fileName: input.fileName,
		resourceType: input.resourceType,
		id: input.id,
	});

	// NOTE: ACL intentionally omitted. Public read access, where desired,
	// should be provided via a bucket policy scoped to a known prefix (or via
	// signed GETs), not by making every uploaded object world-readable by
	// default — that turns any upload path into an open distribution channel.
	const command = new PutObjectCommand({
		Bucket: env.S3_BUCKET_NAME,
		Key: key,
		ContentType: input.contentType,
		ContentLength: input.contentLength,
	});

	const signedUrl = await getSignedUrl(s3Client, command, {
		expiresIn: 900,
		// Force Content-Length and Content-Type into the signature so the
		// client cannot substitute a different size or type at PUT time.
		signableHeaders: new Set(["content-length", "content-type"]),
	});

	return {
		signedUrl,
		key,
		fetchUrl: generatePublicUrl(key),
	};
};
