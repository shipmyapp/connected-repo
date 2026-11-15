import { env } from "@backend/configs/env.config";
import { generatePublicUrl } from "@backend/utils/cdn.utils";
import { ORPCError } from "@orpc/server";

/**
 * Origins a stored media URL may point at: the bucket's public URL and its
 * endpoint, the two `generatePublicUrl` builds from. Derived once from env so
 * it cannot drift from what the presigner hands out.
 */
const CDN_ORIGIN_ALLOWLIST: ReadonlySet<string> = (() => {
	const origins = new Set<string>();
	for (const raw of [env.S3_PUBLIC_URL, env.S3_ENDPOINT]) {
		if (!raw) continue;
		try {
			origins.add(new URL(raw).origin);
		} catch {
			// env-parsed URLs are valid; ignore defensively.
		}
	}
	return origins;
})();

/** True for a URL on the app's own storage (scheme, host and port must match). */
export const isAllowedCdnUrl = (url: string): boolean => {
	try {
		return CDN_ORIGIN_ALLOWLIST.has(new URL(url).origin);
	} catch {
		return false;
	}
};

/** Refuses a client-supplied picture URL that is not on the app's own storage; null passes. */
export const assertOwnCdnUrl = (url: string | null | undefined, field: string): void => {
	if (url == null) return;
	if (!isAllowedCdnUrl(url)) {
		throw new ORPCError("BAD_REQUEST", {
			status: 400,
			message: `${field}: upload the picture here; links to other sites are not accepted.`,
		});
	}
};

/**
 * True for a URL the presigner could have handed this row's creator for this
 * row: `<team>/<creator>/<resource>/<id>_<name>`, or the form used before
 * per-uploader folders, `<team>/media/<id>_<name>`. Compared in its
 * normalised form, so `..` segments cannot step into another folder.
 */
export const isOwnUploadUrl = (
	url: string,
	row: { id: string; teamId: string | null; createdByUserId: string },
): boolean => {
	if (!row.teamId || !isAllowedCdnUrl(url)) return false;
	const parsed = new URL(url);
	const lastSegment = parsed.pathname.split("/").pop() ?? "";
	if (!lastSegment.startsWith(`${row.id}_`)) return false;
	const under = (key: string) => parsed.href.startsWith(new URL(generatePublicUrl(key)).href);
	return under(`${row.teamId}/${row.createdByUserId}/`) || under(`${row.teamId}/media/${row.id}_`);
};
