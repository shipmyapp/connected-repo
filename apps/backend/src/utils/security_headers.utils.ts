/**
 * Headers every backend response carries (the API host has no nginx in
 * front). JSON must not be sniffed into HTML, nothing here is framed, no
 * URL leaks as a referrer, and auth responses (session tokens) are never
 * stored by a cache.
 */
export const applyApiSecurityHeaders = (
	res: { setHeader(name: string, value: string): unknown },
	url: string | undefined,
): void => {
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("Referrer-Policy", "no-referrer");
	res.setHeader("X-Frame-Options", "DENY");
	if (url?.startsWith("/api/auth")) res.setHeader("Cache-Control", "no-store");
};
