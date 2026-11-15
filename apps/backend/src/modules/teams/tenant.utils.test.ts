import { zTenantSlug } from "@connected-repo/zod-schemas/team_app.zod";
import { resolveTenantSlug } from "@connected-repo/zod-schemas/tenant.utils";
import { describe, expect, it } from "vitest";

describe("resolveTenantSlug", () => {
	it("reads the single label of a team host", () => {
		expect(resolveTenantSlug("team1.example.com", "example.com")).toBe("team1");
		expect(resolveTenantSlug("TEAM1.Example.com", "example.com")).toBe("team1");
	});

	it("is null for the shared app, the root, nested labels, other domains and reserved labels", () => {
		expect(resolveTenantSlug("app.example.com", "example.com")).toBeNull();
		expect(resolveTenantSlug("example.com", "example.com")).toBeNull();
		expect(resolveTenantSlug("a.b.example.com", "example.com")).toBeNull();
		expect(resolveTenantSlug("team1.other.com", "example.com")).toBeNull();
		expect(resolveTenantSlug("team1example.com", "example.com")).toBeNull();
		expect(resolveTenantSlug("team1.example.com.evil.test", "example.com")).toBeNull();
		expect(resolveTenantSlug("sa.example.com", "example.com")).toBeNull();
		expect(resolveTenantSlug("www.example.com", "example.com")).toBeNull();
		expect(resolveTenantSlug("superadmin.example.com", "example.com")).toBeNull();
	});

	it("ignores the port", () => {
		expect(resolveTenantSlug("team1.localhost:5173", "localhost")).toBe("team1");
	});

	it("is off without a root", () => {
		expect(resolveTenantSlug("team1.example.com", undefined)).toBeNull();
	});
});

describe("zTenantSlug", () => {
	it("lower-cases a slug and refuses reserved or malformed ones", () => {
		expect(zTenantSlug.parse("Acme-Events")).toBe("acme-events");
		expect(zTenantSlug.safeParse("app").success).toBe(false);
		expect(zTenantSlug.safeParse("-bad").success).toBe(false);
		expect(zTenantSlug.safeParse("ab").success).toBe(false);
		expect(zTenantSlug.safeParse("a.b").success).toBe(false);
	});
});
