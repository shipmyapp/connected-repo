import { superAdminRouter } from "@backend/routers/super_admin/super_admin.router";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { createRouterClient } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

const { OPERATOR } = vi.hoisted(() => ({ OPERATOR: "operator@example.com" }));

vi.mock("@backend/configs/env.config", async (importOriginal) => {
	const original = await importOriginal<typeof import("@backend/configs/env.config")>();
	return { ...original, env: { ...original.env, SUPER_ADMIN_EMAILS: OPERATOR } };
});

describe("rpcSuperAdminProcedure", () => {
	it("refuses an allowlisted address the account has not verified", async () => {
		const context = await createUserAndLogin({ email: OPERATOR }, { verified: false });
		await expect(createRouterClient(superAdminRouter, { context }).ping()).rejects.toMatchObject({
			status: 403,
		});
	});

	it("lets a verified allowlisted address in", async () => {
		const context = await createUserAndLogin({ email: OPERATOR });
		await expect(createRouterClient(superAdminRouter, { context }).ping()).resolves.toMatchObject({
			ok: true,
		});
	});
});
