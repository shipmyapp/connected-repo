import type { LookupAddress } from "node:dns";
import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for outbound webhook URLs.
 *
 * Rejects:
 *  - non-https schemes (blocks http://, file://, gopher://, etc.)
 *  - credentials in URL
 *  - hosts that resolve to loopback / private / link-local / CGNAT / IPv6 ULA / metadata IPs
 *
 * Note: this is a TOCTOU-vulnerable check (DNS can change between validation and connect).
 * Callers MUST also pass `maxRedirects: 0` (or re-validate each hop) to prevent
 * DNS-rebinding / redirect-based bypass. Ideally, outbound webhook posting should be
 * gated behind an egress proxy allowlist.
 */

const IPV4_METADATA_HOSTS = new Set([
	// AWS / GCP / Azure / OpenStack / DigitalOcean / Oracle metadata service
	"169.254.169.254",
	// Alibaba Cloud metadata
	"100.100.100.200",
]);

function ipv4ToInt(ip: string): number | null {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let n = 0;
	for (const part of parts) {
		const octet = Number(part);
		if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
		n = (n << 8) | octet;
	}
	return n >>> 0;
}

function ipv4InRange(ip: string, cidr: string): boolean {
	const [range, bitsStr] = cidr.split("/");
	if (!range || !bitsStr) return false;
	const bits = Number(bitsStr);
	const ipInt = ipv4ToInt(ip);
	const rangeInt = ipv4ToInt(range);
	if (ipInt === null || rangeInt === null) return false;
	if (bits === 0) return true;
	const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
	return (ipInt & mask) === (rangeInt & mask);
}

const IPV4_BLOCKED_RANGES = [
	"0.0.0.0/8", // "This network"
	"10.0.0.0/8", // RFC1918 private
	"100.64.0.0/10", // CGNAT
	"127.0.0.0/8", // Loopback
	"169.254.0.0/16", // Link-local (includes cloud metadata IP)
	"172.16.0.0/12", // RFC1918 private
	"192.0.0.0/24", // IETF protocol assignments
	"192.0.2.0/24", // TEST-NET-1
	"192.168.0.0/16", // RFC1918 private
	"198.18.0.0/15", // Benchmarking
	"198.51.100.0/24", // TEST-NET-2
	"203.0.113.0/24", // TEST-NET-3
	"224.0.0.0/4", // Multicast
	"240.0.0.0/4", // Reserved / broadcast
	"255.255.255.255/32", // Limited broadcast
];

function isBlockedIPv4(ip: string): boolean {
	if (IPV4_METADATA_HOSTS.has(ip)) return true;
	return IPV4_BLOCKED_RANGES.some((cidr) => ipv4InRange(ip, cidr));
}

function isBlockedIPv6(ip: string): boolean {
	const normalized = ip.toLowerCase();
	// Unspecified :: and loopback ::1
	if (normalized === "::" || normalized === "::1") return true;
	// IPv4-mapped IPv6 (::ffff:a.b.c.d) — re-check as IPv4
	const v4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
	if (v4Mapped) return isBlockedIPv4(v4Mapped);
	// IPv4-compatible IPv6 (deprecated) ::a.b.c.d
	const v4Compat = normalized.match(/^::(\d+\.\d+\.\d+\.\d+)$/)?.[1];
	if (v4Compat) return isBlockedIPv4(v4Compat);
	// Parse first hextet for prefix checks
	const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
	// fc00::/7 (Unique Local Address, includes fd00::/8)
	if ((firstHextet & 0xfe00) === 0xfc00) return true;
	// fe80::/10 (Link-local)
	if ((firstHextet & 0xffc0) === 0xfe80) return true;
	// ff00::/8 (Multicast)
	if ((firstHextet & 0xff00) === 0xff00) return true;
	// 2001:db8::/32 (Documentation)
	if (normalized.startsWith("2001:db8:") || normalized.startsWith("2001:0db8:")) return true;
	// 64:ff9b::/96 NAT64 to private v4 — treat conservatively as allowed unless mapped v4 is private
	return false;
}

export class SsrfBlockedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SsrfBlockedError";
	}
}

/**
 * Validate a webhook URL for SSRF safety. Throws SsrfBlockedError on rejection.
 * Returns the parsed URL (with resolved hostname list) on success.
 */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new SsrfBlockedError("Invalid webhook URL");
	}

	if (parsed.protocol !== "https:") {
		throw new SsrfBlockedError(`Webhook URL must use https (got ${parsed.protocol})`);
	}

	if (parsed.username || parsed.password) {
		throw new SsrfBlockedError("Webhook URL must not contain credentials");
	}

	const hostname = parsed.hostname;
	if (!hostname) throw new SsrfBlockedError("Webhook URL missing hostname");

	// If literal IP was provided, validate it directly.
	const literalFamily = net.isIP(hostname);
	if (literalFamily === 4) {
		if (isBlockedIPv4(hostname))
			throw new SsrfBlockedError(`Webhook URL resolves to blocked address ${hostname}`);
		return parsed;
	}
	if (literalFamily === 6) {
		if (isBlockedIPv6(hostname))
			throw new SsrfBlockedError(`Webhook URL resolves to blocked address ${hostname}`);
		return parsed;
	}

	// Resolve DNS with all:true so we see every A/AAAA answer.
	let addresses: LookupAddress[];
	try {
		addresses = await dns.lookup(hostname, { all: true });
	} catch (err) {
		throw new SsrfBlockedError(
			`Webhook URL hostname could not be resolved: ${(err as Error).message}`,
		);
	}

	if (addresses.length === 0) {
		throw new SsrfBlockedError("Webhook URL hostname resolved to no addresses");
	}

	for (const addr of addresses) {
		if (addr.family === 4 && isBlockedIPv4(addr.address)) {
			throw new SsrfBlockedError(`Webhook URL resolves to blocked address ${addr.address}`);
		}
		if (addr.family === 6 && isBlockedIPv6(addr.address)) {
			throw new SsrfBlockedError(`Webhook URL resolves to blocked address ${addr.address}`);
		}
	}

	return parsed;
}
