import { OpenApiAuthContext } from "@backend/procedures/open_api_auth.procedure";
import { getClientIpAddress } from "@backend/utils/client-info.utils";
import { isIPWhitelisted } from "@backend/utils/ipChecker.utils";
import { MiddlewareNextFn, ORPCError } from "@orpc/server";

/**
 * IP Whitelist Middleware
 * Checks request IP against team.allowedIPs (exact match or CIDR range, if not empty)
 * Requires apiKeyAuthMiddleware to be run first to attach team to context
 */
export const ipWhitelistMiddleware = async ({ 
	context, 
	next 
}: { 
	context: OpenApiAuthContext; 
	next: MiddlewareNextFn<unknown> 
}) => {

	const { allowedIPs } = context.team;

	// Check IP whitelist (if configured)
	if (allowedIPs && allowedIPs.length > 0) {
		const clientIp = getClientIpAddress(context.reqHeaders);

		if (!clientIp || clientIp === "unknown") {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Client IP not detected",
			});
		}

		const isIPAllowed = allowedIPs.some((whitelistEntry: string) =>
			isIPWhitelisted(clientIp, whitelistEntry),
		);

		if (!isIPAllowed) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Client IP not whitelisted",
				data: { clientIp },
			});
		}
	}

	// If IP check passes (or is not configured), proceed
	return next({
		context,
	});
};
