/**
 * The origin an app calls. Empty (production and the dev proxy) means
 * its own origin: oRPC's link needs an absolute URL, so the page's origin is
 * used; a configured URL loses any trailing slash.
 */
export const resolveApiOrigin = (configured: string | undefined, pageOrigin: string): string => {
	const trimmed = configured?.trim() ?? "";
	return trimmed === "" ? pageOrigin : trimmed.replace(/\/+$/, "");
};
