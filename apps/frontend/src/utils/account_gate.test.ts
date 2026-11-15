import { LEGAL_VERSION } from "@connected-repo/zod-schemas/legal.zod";
import { describe, expect, it } from "vitest";
import { accountGateRedirect, safeNextPath } from "./account_gate";

const here = { pathname: "/journal-entries", search: "?q=a b" };

describe("accountGateRedirect", () => {
	it("sends a pending deletion to its page, online or offline", () => {
		const user = { deletionRequestedAt: 1, legalAcceptedVersion: LEGAL_VERSION };
		for (const online of [true, false]) {
			expect(accountGateRedirect(user, here, { online, legalConfigured: true })).toBe(
				"/account/deletion-pending",
			);
		}
	});

	it("asks for agreement to a changed version online only", () => {
		const user = { deletionRequestedAt: null, legalAcceptedVersion: "2000-01-01" };
		expect(accountGateRedirect(user, here, { online: true, legalConfigured: true })).toBe(
			`/legal/accept?next=${encodeURIComponent("/journal-entries?q=a b")}`,
		);
		expect(accountGateRedirect(user, here, { online: false, legalConfigured: true })).toBeNull();
	});

	it("asks nothing when the texts are not configured or already agreed to", () => {
		expect(
			accountGateRedirect({ deletionRequestedAt: null, legalAcceptedVersion: null }, here, {
				online: true,
				legalConfigured: false,
			}),
		).toBeNull();
		expect(
			accountGateRedirect(
				{ deletionRequestedAt: null, legalAcceptedVersion: LEGAL_VERSION },
				here,
				{
					online: true,
					legalConfigured: true,
				},
			),
		).toBeNull();
	});
});

describe("safeNextPath", () => {
	it("keeps a path on this app and refuses anything else", () => {
		expect(safeNextPath("/journal-entries?x=1")).toBe("/journal-entries?x=1");
		expect(safeNextPath("//evil.example")).toBe("/dashboard");
		expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
		expect(safeNextPath("https://evil.example")).toBe("/dashboard");
		expect(safeNextPath(null)).toBe("/dashboard");
	});
});
