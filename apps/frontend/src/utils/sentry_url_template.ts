/**
 * Collapse volatile path segments to `:id` so Sentry groups events by
 * URL shape rather than treating every `/journal-entries/01H.../edit`
 * request as a distinct issue. Kept in sync with the backend copy at
 * apps/backend/src/utils/sentry_url_template.ts.
 */
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS_RE = /^\d{6,}$/;

export function normalizeUrlPath(path: string): string {
	if (!path) return path;
	const qIdx = path.indexOf("?");
	const hIdx = path.indexOf("#");
	const sep = qIdx >= 0 ? qIdx : hIdx >= 0 ? hIdx : path.length;
	const pathname = path.slice(0, sep);
	const tail = path.slice(sep);

	const normalized = pathname
		.split("/")
		.map((seg) => {
			if (!seg) return seg;
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
		return u.toString();
	} catch {
		return normalizeUrlPath(url);
	}
}
