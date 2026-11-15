import { db } from "@backend/db/db";
import { auth } from "@backend/modules/auth/auth.config";
import { encryptStoredOAuthTokens } from "@backend/modules/auth/services/encrypt_stored_tokens.auth.service";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { symmetricDecrypt } from "better-auth/crypto";
import { ulid } from "ulid";
import { describe, expect, it } from "vitest";

describe("Better Auth hardening", () => {
	it("accepts a signed bearer token and refuses the raw stored token", async () => {
		const context = await createUserAndLogin();
		const { token: raw } = await db.sessions
			.unscope("default")
			.find(context.session.id)
			.select("token");
		const refused = await auth.api.getSession({
			headers: new Headers({ authorization: `Bearer ${raw}` }),
		});
		expect(refused).toBeNull();

		const signIn = await auth.api.signInEmail({
			body: { email: context.user.email as string, password: "password123" },
			asResponse: true,
		});
		const signed = signIn.headers.get("set-auth-token");
		expect(signed).toBeTruthy();
		const accepted = await auth.api.getSession({
			headers: new Headers({ authorization: `Bearer ${signed}` }),
		});
		expect(accepted?.user.id).toBe(context.user.id);
	});

	it("keeps provider tokens encrypted, including rows stored before", async () => {
		expect(auth.options.account?.encryptOAuthTokens).toBe(true);
		const context = await createUserAndLogin();
		const row = await db.accounts.create({
			userId: context.user.id,
			accountId: `google-${ulid()}`,
			providerId: "google",
			accessToken: "ya29.plain-access",
			refreshToken: "1//plain-refresh",
		});
		expect(await encryptStoredOAuthTokens()).toBeGreaterThanOrEqual(1);
		const stored = await db.accounts.find(row.id).select("accessToken", "refreshToken");
		expect(stored.accessToken).not.toBe("ya29.plain-access");
		const { secretConfig } = await auth.$context;
		expect(await symmetricDecrypt({ key: secretConfig, data: stored.accessToken ?? "" })).toBe(
			"ya29.plain-access",
		);
		expect(await symmetricDecrypt({ key: secretConfig, data: stored.refreshToken ?? "" })).toBe(
			"1//plain-refresh",
		);
		expect(await encryptStoredOAuthTokens()).toBe(0); // idempotent
	});

	it("sends no usage data to the library vendor", () => {
		expect(auth.options.telemetry?.enabled).toBe(false);
	});
});
