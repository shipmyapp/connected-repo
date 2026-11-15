import { createHash } from "node:crypto";
import { UAParser } from "ua-parser-js";

/**
 * Extract the client IP address from request headers.
 *
 * ============================================================================
 * !!! SECURITY-CRITICAL TRUST ASSUMPTION — READ BEFORE CHANGING DEPLOYMENT !!!
 * ============================================================================
 *
 * This function UNCONDITIONALLY TRUSTS the `x-forwarded-for` and `x-real-ip`
 * request headers. It performs NO validation of the upstream socket, NO
 * trusted-proxy CIDR check, and NO hop-count enforcement.
 *
 * That trust is safe ONLY when this app is deployed strictly behind a reverse
 * proxy (e.g. Cloudflare, AWS ALB, nginx, Caddy, Fly.io edge) that:
 *   1. Terminates every inbound connection from the public internet, AND
 *   2. STRIPS any client-supplied `x-forwarded-for` / `x-real-ip` values on
 *      ingress and REWRITES them with the true client IP on every hop.
 *
 * If this app is EVER exposed directly to untrusted clients — even briefly,
 * even on a "temporary" dev/staging endpoint reachable from the internet —
 * a malicious client can forge these headers and spoof any IP they want.
 * That spoofing silently breaks every security control that keys off the
 * return value of this function, including but not limited to:
 *
 *   - Rate-limit bucket keys such as `login:ip:${addr}` — an attacker can
 *     rotate forged IPs to bypass per-IP throttles on auth, OTP, etc.
 *   - The OpenAPI IP-whitelist enforcement — an attacker can claim any
 *     whitelisted source IP and gain access they should not have.
 *   - Session-security IP-change detection — an attacker who steals a
 *     session token can forge the original IP and evade re-auth prompts.
 *
 * IF THE DEPLOYMENT TOPOLOGY EVER CHANGES so that this process can receive
 * connections directly from untrusted clients, THIS FUNCTION MUST BE HARDENED
 * BEFORE THAT CHANGE SHIPS. The correct fix is to gate the header extraction
 * on `req.socket.remoteAddress` matching a configured trusted-proxy allowlist
 * (CIDR ranges of your known proxies); fall back to the socket peer address
 * whenever the immediate peer is not a trusted proxy.
 *
 * Do not "just trust the header" in a new topology because it worked in the
 * old one. The failure mode is silent, remote, and unauthenticated.
 * ============================================================================
 */
export function getClientIpAddress(headers: Headers) {
	// Check X-Forwarded-For header (set by proxies/load balancers)
	const forwardedFor = headers.get("x-forwarded-for");
	if (forwardedFor) {
		// X-Forwarded-For can contain multiple IPs, get the first one (client IP)
		const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
		const ip = typeof ips === "string" ? ips.split(",")[0]?.trim() : ips;
		if (ip) {
			return ip;
		}
	}

	const xRealIp = headers.get("x-real-ip");

	// Check X-Real-IP header
	const realIp = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
	if (realIp && typeof realIp === "string") {
		return realIp;
	}

	// Fall back to unknown
	return "unknown";
}

/**
 * Generate a device fingerprint based on request headers, optimized for robustness.
 * Creates a stable hash of core browser/device characteristics.
 * @public
 */
export function generateDeviceFingerprint(headers: Headers): string {
	// Normalize User-Agent: convert to lowercase for case-insensitivity
	const userAgent = headers.get("user-agent");
	const uaParser = new UAParser(userAgent || "");

	// Normalize Accept-Language: Only use the primary language code (e.g., 'en' from 'en-US,en;q=0.9')
	const acceptLanguage = headers.get("accept-language");
	const primaryLanguage = acceptLanguage
		? acceptLanguage
				.split(",")[0] // Get the first (primary) part: 'en-US'
				?.substring(0, 2) // Get the two-letter code: 'en'
				.toLowerCase() || ""
		: "";

	const secChUa = headers.get("sec-ch-ua");
	const secChUaMobile = headers.get("sec-ch-ua-mobile");
	const secChUaPlatform = headers.get("sec-ch-ua-platform");

	// Combine normalized components for fingerprinting
	const components = [
		// Core Parsed Components (Highly Stable)
		uaParser.getBrowser().name?.toString().toLowerCase(),
		uaParser.getOS().name?.toString().toLowerCase() || "",
		uaParser.getDevice().toString().toLowerCase() || "",

		// Stabilized Headers
		primaryLanguage,

		// Client Hints (Generally Stable for a given browser/OS)
		(Array.isArray(secChUa) ? secChUa[0] : secChUa || "").toLowerCase(),
		(Array.isArray(secChUaMobile) ? secChUaMobile[0] : secChUaMobile || "").toLowerCase(),
		(Array.isArray(secChUaPlatform) ? secChUaPlatform[0] : secChUaPlatform || "").toLowerCase(),

		// Removed: 'accept-encoding' and 'accept' as they are highly request/context-dependent.
	];

	// Create a hash of the combined, normalized components
	const fingerprintString = components.join("|");
	const hash = createHash("sha256").update(fingerprintString).digest("hex");

	// Return first 32 characters for storage efficiency
	return hash.substring(0, 32);
}
