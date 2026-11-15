/**
 * OAuth redirect URIs a connected app may register (ADR-045): `https:` with
 * a host, or `http:` to this computer with a port (RFC 8252 loopback:
 * 127.0.0.1, [::1], localhost). No fragment (RFC 6749 §3.1.2), no userinfo,
 * no other scheme: a scheme that runs or embeds content where it is opened
 * (javascript:, data:, blob:, file:) must never be a place the consent page
 * sends the browser, and plain http elsewhere carries the code in clear.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "[::1]", "localhost"]);

export const isAcceptableRedirectUri = (raw: string): boolean => {
	if (raw.length > 2048 || raw.includes("#")) return false;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	if (url.username !== "" || url.password !== "") return false;
	if (url.protocol === "https:") return url.hostname !== "";
	if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname) && url.port !== "";
	return false;
};

/**
 * Where the consent page may send the browser after Allow or Deny: the URL
 * the server returned, only if it is on the redirect URI of the authorize
 * request the page was opened for (same scheme, host, port and path) and
 * that redirect URI is itself acceptable. Anything else is null: show an
 * error instead of navigating.
 */
export const consentRedirectTarget = (
	returned: string,
	expectedRedirectUri: string,
): string | null => {
	if (!isAcceptableRedirectUri(expectedRedirectUri)) return null;
	let target: URL;
	let expected: URL;
	try {
		target = new URL(returned);
		expected = new URL(expectedRedirectUri);
	} catch {
		return null;
	}
	if (target.username !== "" || target.password !== "") return null;
	if (target.origin !== expected.origin || target.pathname !== expected.pathname) return null;
	return target.href;
};
