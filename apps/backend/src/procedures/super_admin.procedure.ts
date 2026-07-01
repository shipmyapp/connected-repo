import { env } from "@backend/configs/env.config";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { ORPCError } from "@orpc/server";

const parseList = (raw: string | undefined): Set<string> => {
	if (!raw) return new Set();
	return new Set(
		raw
			.split(",")
			.map((v) => v.trim().toLowerCase())
			.filter(Boolean),
	);
};

const superAdminEmails = parseList(env.SUPER_ADMIN_EMAILS);
const superAdminPhones = parseList(env.SUPER_ADMIN_PHONE_NUMBERS);

/**
 * Super-admin gate. Allows access only when the authenticated user's email
 * (case-insensitive) or phone number is listed in `SUPER_ADMIN_EMAILS` or
 * `SUPER_ADMIN_PHONE_NUMBERS` env vars. Both are comma-separated.
 *
 * Intentionally simple — no database-backed admin role, no separate auth
 * scheme. If the env lists are empty the gate fails closed (FORBIDDEN).
 */
export const rpcSuperAdminProcedure = rpcProtectedProcedure.use(({ context, next }) => {
	const email = context.user.email?.toLowerCase();
	const phone = context.user.phoneNumber?.toLowerCase();

	const allowed =
		(email && superAdminEmails.has(email)) || (phone && superAdminPhones.has(phone));

	if (!allowed) {
		throw new ORPCError("FORBIDDEN", {
			status: 403,
			message: "Super-admin access required",
		});
	}

	return next({ context });
});
