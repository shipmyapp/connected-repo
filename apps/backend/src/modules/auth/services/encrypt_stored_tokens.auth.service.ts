import { db } from "@backend/db/db";
import { auth } from "@backend/modules/auth/auth.config";
import { symmetricEncrypt } from "better-auth/crypto";

// Better Auth's own test for an encrypted value (`isLikelyEncrypted` in its
// oauth2 utils): it reads anything else back as plain.
const looksEncrypted = (value: string): boolean =>
	value.startsWith("$ba$") || (value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value));

/**
 * Encrypts provider tokens stored before `account.encryptOAuthTokens` was
 * on. Idempotent: encrypted values are left alone. Returns the rows changed.
 */
export const encryptStoredOAuthTokens = async (): Promise<number> => {
	const { secretConfig } = await auth.$context;
	// What Better Auth's own token writer does with encryptOAuthTokens on.
	const encrypt = (data: string) => symmetricEncrypt({ key: secretConfig, data });
	const rows = await db.accounts
		.whereNot({ providerId: "credential" })
		.select("id", "accessToken", "refreshToken");
	let changed = 0;
	for (const row of rows) {
		const patch: { accessToken?: string; refreshToken?: string } = {};
		if (row.accessToken && !looksEncrypted(row.accessToken)) {
			patch.accessToken = await encrypt(row.accessToken);
		}
		if (row.refreshToken && !looksEncrypted(row.refreshToken)) {
			patch.refreshToken = await encrypt(row.refreshToken);
		}
		if (patch.accessToken || patch.refreshToken) {
			await db.accounts.find(row.id).update(patch);
			changed++;
		}
	}
	return changed;
};
