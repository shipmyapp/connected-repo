import type { RpcAuthenticatedContext } from "@backend/procedures/protected.procedure";
import { getClientIpAddress } from "@backend/utils/client-info.utils";
import { logger } from "@backend/utils/logger.utils";
import type { MiddlewareNextFn } from "@orpc/server";

export interface SessionSecurityResult {
	isValid: boolean;
	isSuspicious: boolean;
	reasons: string[];
	action: "allow" | "warn" | "block";
}

/** Session security: logs a session used from another network than it was opened on. Never refuses. */
export const rpcSessionSecurityMiddleware =
	(securityLevel: "low" | "moderate" | "strict" = "moderate") =>
	async ({
		context,
		next,
	}: {
		context: RpcAuthenticatedContext;
		next: MiddlewareNextFn<unknown>;
	}) => {
		const session = context.session;

		const result: SessionSecurityResult = {
			isValid: true,
			isSuspicious: false,
			reasons: [],
			action: "allow",
		};

		const reqHeaders = context.reqHeaders ?? new Headers();

		// The address the server stamped for this request (client-info.utils.ts).
		const currentIP = getClientIpAddress(reqHeaders);

		// Check IP address (allow for dynamic IPs within same subnet for moderate security)
		if (session.ipAddress && session.ipAddress !== currentIP) {
			if (securityLevel !== "low") {
				// Check if IPs are in same /24 subnet (common for mobile/home networks)
				const isSameSubnet = areSameSubnet(session.ipAddress, currentIP);
				if (!isSameSubnet) {
					result.isSuspicious = true;
					result.reasons.push(
						`IP address changed: stored=${session.ipAddress}, current=${currentIP}`,
					);
				}
			}
			// Low security level allows IP changes
		}

		// An address change is logged, never refused: phones move between Wi-Fi
		// and mobile data within minutes, and a stolen cookie is bounded by
		// session revocation (auth.middleware.ts) and, for sensitive acts, by the
		// recent-sign-in check that follows this middleware.
		if (result.isSuspicious && securityLevel !== "low") {
			result.action = "warn";
			logger.warn(
				{ reasons: result.reasons, userId: context.user?.id, sessionId: context.session?.id },
				"Session address changed",
			);
		}

		return next({
			context: {
				...context,
				sessionSecurity: result,
			},
		});
	};

/**
 * Check if two IP addresses are in the same subnet.
 *
 * - IPv4: matches on /24 (first 3 octets).
 * - IPv6: approximates /64 by comparing the first 4 hextets (the standard
 *   end-user allocation). If either address uses the collapsed "::" form we
 *   fall back to strict string equality — expanding the notation is
 *   over-engineering for this heuristic.
 */
function areSameSubnet(ip1: string, ip2: string): boolean {
	try {
		const isV6 = ip1.includes(":") || ip2.includes(":");
		if (isV6) {
			// Conservative fallback for collapsed notation.
			if (ip1.includes("::") || ip2.includes("::")) {
				return ip1 === ip2;
			}
			const p1 = ip1.split(":");
			const p2 = ip2.split(":");
			if (p1.length < 4 || p2.length < 4) return false;
			return p1[0] === p2[0] && p1[1] === p2[1] && p1[2] === p2[2] && p1[3] === p2[3];
		}

		const parts1 = ip1.split(".");
		const parts2 = ip2.split(".");

		// Check if first 3 octets match (same /24 subnet)
		return (
			parts1.length === 4 &&
			parts2.length === 4 &&
			parts1[0] === parts2[0] &&
			parts1[1] === parts2[1] &&
			parts1[2] === parts2[2]
		);
	} catch {
		return false;
	}
}
