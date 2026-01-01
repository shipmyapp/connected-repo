/**
 * Normalize IPv6 address by expanding :: notation and converting to full form
 * @param ipv6 - IPv6 address (e.g., "2001:db8::1" or "::1")
 * @returns Normalized IPv6 address with all 8 hextets
 */
function normalizeIPv6(ipv6: string): string {
	// Remove leading/trailing whitespace
	ipv6 = ipv6.trim();

	// Split by ":"
	const parts = ipv6.split(":");

	// Find the position of "::" (if it exists)
	const doubleColonIndex = ipv6.indexOf("::");

	if (doubleColonIndex !== -1) {
		// Expand "::" notation
		const leftParts = ipv6.slice(0, doubleColonIndex).split(":").filter(Boolean);
		const rightParts = ipv6
			.slice(doubleColonIndex + 2)
			.split(":")
			.filter(Boolean);
		const missingParts = 8 - leftParts.length - rightParts.length;

		const expanded = [
			...leftParts,
			...Array(missingParts).fill("0"),
			...rightParts,
		];

		return expanded.map((part) => part.padStart(4, "0")).join(":");
	}

	// Already in full form, just pad each hextet
	return parts.map((part) => part.padStart(4, "0")).join(":");
}

/**
 * Check if an IP address matches a whitelist entry
 * Supports exact match for both IPv4 and IPv6
 * IPv6 addresses are normalized before comparison
 * @param ip - Client IP address
 * @param whitelistEntry - Whitelist entry (exact IP)
 * @returns True if IP matches
 */
export function isIPWhitelisted(ip: string, whitelistEntry: string): boolean {
	// Check if both are IPv6
	const isIPv6Client = ip.includes(":");
	const isIPv6Whitelist = whitelistEntry.includes(":");

	if (isIPv6Client && isIPv6Whitelist) {
		// Normalize both IPv6 addresses before comparison
		try {
			const normalizedClient = normalizeIPv6(ip);
			const normalizedWhitelist = normalizeIPv6(whitelistEntry);
			return normalizedClient === normalizedWhitelist;
		} catch {
			return false;
		}
	}

	// IPv4 or mixed - direct comparison
	return ip === whitelistEntry;
}
