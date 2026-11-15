import { createServer, IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { Socket } from "node:net";
import { db } from "@backend/db/db";
import { buildTenantManifest } from "@backend/modules/teams/services/branding.teams.service";
import { defaultContext } from "@backend/test/setup";
import type { TeamBrandingPublic } from "@connected-repo/zod-schemas/team_app.zod";
import { describe, expect, it } from "vitest";
import { resolveSlugFromRequest, tenantHandler } from "./tenant.handler";

const requestFor = (url: string, headers: Record<string, string>) => {
	const req = new IncomingMessage(new Socket());
	req.url = url;
	req.method = "GET";
	req.headers = headers;
	return req;
};

const branding = (overrides: Partial<TeamBrandingPublic> = {}): TeamBrandingPublic => ({
	teamId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
	name: "Acme",
	slug: "acme",
	logoUrl: null,
	appName: null,
	appShortName: null,
	tagline: null,
	pwaIconUrl: null,
	primaryColor: null,
	secondaryColor: null,
	backgroundColor: null,
	...overrides,
});

describe("buildTenantManifest", () => {
	it("falls back to the template's icons and colour", () => {
		const manifest = buildTenantManifest(branding());
		expect(manifest.id).toBe("/?tenant=acme");
		expect(manifest.name).toBe("Acme");
		expect(manifest.theme_color).toBe("#1976d2");
		expect(manifest.icons.map((i) => i.src)).toEqual([
			"/android-chrome-192x192.png",
			"/android-chrome-512x512.png",
			"/apple-touch-icon.png",
		]);
	});

	it("uses the team's icon without a type", () => {
		const icon = "https://cdn.example.test/acme/icon.webp";
		const manifest = buildTenantManifest(
			branding({ pwaIconUrl: icon, primaryColor: "#ff5722", appName: "Acme Journal" }),
		);
		expect(manifest.name).toBe("Acme Journal");
		expect(manifest.short_name).toBe("Acme Journal");
		expect(manifest.theme_color).toBe("#ff5722");
		expect(manifest.icons).toHaveLength(3);
		for (const entry of manifest.icons) {
			expect(entry.src).toBe(icon);
			expect(entry).not.toHaveProperty("type");
		}
	});
});

describe("resolveSlugFromRequest", () => {
	it("reads the slug from Host, else from ?slug=", () => {
		expect(
			resolveSlugFromRequest(
				requestFor("/api/tenant/manifest.webmanifest", { host: "acme.localhost:5174" }),
			),
		).toBe("acme");
		expect(
			resolveSlugFromRequest(
				requestFor("/api/tenant/manifest.webmanifest?slug=acme", { host: "localhost:3000" }),
			),
		).toBe("acme");
		expect(
			resolveSlugFromRequest(
				requestFor("/api/tenant/manifest.webmanifest?slug=-bad", { host: "localhost:3000" }),
			),
		).toBeNull();
		expect(
			resolveSlugFromRequest(
				requestFor("/api/tenant/manifest.webmanifest?slug=www", { host: "localhost:3000" }),
			),
		).toBeNull();
	});
});

describe("GET /api/tenant/manifest.webmanifest", () => {
	it("serves a live team's manifest uncached, and 404 for anything else", async () => {
		const teamId = defaultContext?.user.activeTeamAppId;
		if (!teamId) throw new Error("no team");
		await db.teamsApp.find(teamId).update({ slug: "acme", appName: "Acme Journal" });

		const server = createServer((req, res) => {
			if (tenantHandler.matches(req)) void tenantHandler.handle(req, res);
			else {
				res.statusCode = 418;
				res.end();
			}
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;
		const base = `http://127.0.0.1:${port}/api/tenant/manifest.webmanifest`;
		try {
			const ok = await fetch(`${base}?slug=acme`);
			expect(ok.status).toBe(200);
			expect(ok.headers.get("content-type")).toBe("application/manifest+json");
			expect(ok.headers.get("cache-control")).toBe("no-cache");
			expect(await ok.json()).toMatchObject({ id: "/?tenant=acme", name: "Acme Journal" });

			expect((await fetch(`${base}?slug=nobody-here`)).status).toBe(404);
			expect((await fetch(base, { method: "POST" })).status).toBe(405);
		} finally {
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
