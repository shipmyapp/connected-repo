/**
 * Collapse volatile path segments to `:id` so Sentry groups events by
 * URL shape rather than treating every `/journal-entries/01H.../edit`
 * request as a distinct issue, and drop the query and the hash, which
 * can carry codes and state. Kept in step with the backend copy at
 * apps/backend/src/utils/sentry_url_template.ts.
 */
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS_RE = /^\d{6,}$/;
/**
 * Top-level paths whose next segment is a bearer key (an invite token, a
 * share code): `/<parent>/<key>` is sent as `/<parent>/:token`. Only at the
 * start of the path, so `/api/user-app/<parent>/list` stays a procedure
 * name. Empty in the starter; add a parent when a route takes a secret.
 */
const TOKEN_PARENTS = new Set<string>([]);

export function normalizeUrlPath(path: string): string {
	if (!path) return path;
	const qIdx = path.indexOf("?");
	const hIdx = path.indexOf("#");
	const sep = qIdx >= 0 ? qIdx : hIdx >= 0 ? hIdx : path.length;
	const pathname = path.slice(0, sep);
	const tail = path.slice(sep);

	const segments = pathname.split("/");
	const normalized = segments
		.map((seg, index) => {
			if (!seg) return seg;
			// A key to something is never sent as is.
			if (index === 2 && TOKEN_PARENTS.has(segments[1] ?? "")) return ":token";
			if (ULID_RE.test(seg) || UUID_RE.test(seg) || DIGITS_RE.test(seg)) {
				return ":id";
			}
			return seg;
		})
		.join("/");

	return normalized + tail;
}

export function normalizeUrl(url: string): string {
	if (!url) return url;
	try {
		const u = new URL(url);
		u.pathname = normalizeUrlPath(u.pathname);
		// The query and the hash can carry codes and state: the shape is enough.
		u.search = "";
		u.hash = "";
		return u.toString();
	} catch {
		return normalizeUrlPath(url);
	}
}
