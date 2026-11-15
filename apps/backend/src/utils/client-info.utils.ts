import { createHash } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";
import { env, isProd, isStaging } from "@backend/configs/env.config";
import { UAParser } from "ua-parser-js";

/** Request header the server writes with the client's address (main.handler.ts). */
export const CLIENT_IP_HEADER = "x-client-ip";

const unmapV4 = (ip: string): string =>
	ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;

/**
 * The client's address. `trustedHops` is the number of trusted proxy hops
 * counted from the right of X-Forwarded-For: each trusted hop wrote one
 * entry, so the client is the entry `trustedHops` places from the right.
 * Entries further left were written by the client and are never read.
 * 0 means no proxy: the socket (TCP peer) address is the client. Returns
 * null when the chosen value is not an IP address.
 */
export const resolveClientIp = (
	forwardedFor: string | string[] | undefined,
	peerAddress: string | undefined,
	trustedHops: number,
): string | null => {
	const pick = (value: string | undefined): string | null => {
		if (!value) return null;
		const ip = unmapV4(value);
		return isIP(ip) ? ip : null;
	};
	if (trustedHops === 0) return pick(peerAddress);
	const entries = [forwardedFor ?? []]
		.flat()
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);
	// Fewer entries than trusted hops: the request did not come through every
	// proxy (it should not happen when the backend port is internal only).
	// The left-most entry, else the socket, is the best remaining guess.
	return pick(entries[entries.length - trustedHops] ?? entries[0] ?? peerAddress);
};

/**
 * Decides the client address once per request and writes it into
 * `x-client-ip`, dropping any value the client sent. Called first thing in
 * mainRequestDispatcher; every handler (oRPC, Better Auth) reads req.headers
 * after it.
 */
export const stampClientIp = (req: {
	headers: IncomingHttpHeaders;
	socket?: { remoteAddress?: string } | null;
}): void => {
	delete req.headers[CLIENT_IP_HEADER];
	const ip = resolveClientIp(
		req.headers["x-forwarded-for"],
		req.socket?.remoteAddress,
		env.TRUSTED_PROXY_COUNT,
	);
	if (ip) req.headers[CLIENT_IP_HEADER] = ip;
};

/**
 * The client address the server stamped for this request. Never reads
 * X-Forwarded-For or X-Real-IP. Without a stamp (a test client, a script)
 * production and staging say "unknown", which the API-key IP allowlist
 * refuses; elsewhere it is the loopback address, as Better Auth records it.
 */
export function getClientIpAddress(headers: Headers) {
	const ip = headers.get(CLIENT_IP_HEADER);
	if (ip && isIP(ip)) return ip;
	return isProd || isStaging ? "unknown" : "127.0.0.1";
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
