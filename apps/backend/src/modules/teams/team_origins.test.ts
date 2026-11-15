import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import { db } from "@backend/db/db";
import { auth } from "@backend/modules/auth/auth.config";
import { mainRequestDispatcher } from "@backend/request_handlers/main.handler";
import { defaultContext } from "@backend/test/setup";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	isAllowedCredentialedOrigin,
	teamOriginsForAuthRequest,
} from "./services/branding.teams.service";

// Only ALLOWED_ORIGINS and the host of a live team are trusted with
// credentials (TENANT_ROOT_DOMAIN=localhost in .env.test, where http and
// ports are allowed). Every other subdomain of the root is a stranger.
const ACME = "http://acme.localhost:5174";
const NOBODY = "http://nobody.localhost:5174";

describe("trusted origins", () => {
	beforeEach(async () => {
		const teamId = defaultContext?.user.activeTeamAppId;
		if (!teamId || !defaultContext) throw new Error("no team");
		await db.teamsApp.find(teamId).update({ slug: "acme" });
		const gone = await db.teamsApp.create({
			name: "Gone",
			createdByUserId: defaultContext.user.id,
			slug: "gone",
		});
		await db.teamsApp.find(gone.id).delete();
	});

	it("isAllowedCredentialedOrigin: the explicit list and live team hosts only", async () => {
		const listed = allowedOrigins[0];
		if (!listed) throw new Error(".env.test lists no ALLOWED_ORIGINS");
		expect(await isAllowedCredentialedOrigin(listed)).toBe(true);
		expect(await isAllowedCredentialedOrigin(ACME)).toBe(true);
		for (const origin of [
			NOBODY,
			"http://gone.localhost:5174",
			"http://www.localhost:5174",
			"http://cdn.localhost:5174",
			"http://a.b.localhost:5174",
			"http://acme.localhost.evil.test",
			"http://acmelocalhost:5174",
			"https://evil.test",
			`${ACME}/`,
			null,
		]) {
			expect(await isAllowedCredentialedOrigin(origin), String(origin)).toBe(false);
		}
	});

	it("teamOriginsForAuthRequest: the request's own live team host, by Origin or callbackURL", async () => {
		const post = (origin: string) =>
			new Request("http://localhost:3001/api/auth/sign-in/social", {
				method: "POST",
				headers: { origin },
			});
		expect(await teamOriginsForAuthRequest(post(ACME))).toEqual([ACME]);
		expect(await teamOriginsForAuthRequest(post(NOBODY))).toEqual([]);
		expect(
			await teamOriginsForAuthRequest(
				new Request(
					`http://localhost:3001/api/auth/x?callbackURL=${encodeURIComponent(`${ACME}/dashboard`)}`,
				),
			),
		).toEqual([ACME]);
		expect(
			await teamOriginsForAuthRequest(
				new Request(
					`http://localhost:3001/api/auth/x?callbackURL=${encodeURIComponent(`${NOBODY}/dashboard`)}`,
				),
			),
		).toEqual([]);
		expect(await teamOriginsForAuthRequest()).toEqual([]);
	});

	it("Better Auth's trustedOrigins adds the request's live team host and nothing else", async () => {
		// Better Auth skips its own origin check under NODE_ENV=test, so the
		// configured function is checked directly.
		const trusted = auth.options.trustedOrigins;
		if (typeof trusted !== "function") throw new Error("trustedOrigins is not per request");
		const forOrigin = (origin: string) =>
			trusted(
				new Request("http://localhost:3001/api/auth/sign-in/social", {
					method: "POST",
					headers: { origin },
				}),
			);
		expect(await forOrigin(ACME)).toEqual([...allowedOrigins, ACME]);
		expect(await forOrigin(NOBODY)).toEqual(allowedOrigins);
		expect(await forOrigin("http://www.localhost:5174")).toEqual(allowedOrigins);
		expect(await trusted(undefined)).toEqual(allowedOrigins);
	});

	describe("over HTTP", () => {
		let base = "";
		let close: () => Promise<void> = async () => {};

		beforeEach(async () => {
			const server = createServer((req, res) => void mainRequestDispatcher(req, res));
			await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
			const { port } = server.address() as AddressInfo;
			base = `http://127.0.0.1:${port}`;
			close = async () => {
				server.closeAllConnections();
				await new Promise((resolve) => server.close(resolve));
			};
		});
		afterEach(async () => await close());

		const preflight = (path: string, origin: string) =>
			fetch(`${base}${path}`, {
				method: "OPTIONS",
				headers: {
					origin,
					"access-control-request-method": "POST",
					"access-control-request-headers": "content-type,x-team-id",
				},
			});

		it("the user app answers a live team host's preflight, and nobody else's", async () => {
			const ok = await preflight("/api/user-app/teams/getMyTeams", ACME);
			expect(ok.headers.get("access-control-allow-origin")).toBe(ACME);
			expect(ok.headers.get("access-control-allow-credentials")).toBe("true");
			for (const origin of [NOBODY, "http://cdn.localhost:5174", "http://a.b.localhost:5174"]) {
				const refused = await preflight("/api/user-app/teams/getMyTeams", origin);
				expect(refused.headers.get("access-control-allow-origin"), origin).toBeNull();
			}
		});

		it("Better Auth's CORS answers a live team host, and nobody else", async () => {
			const ok = await preflight("/api/auth/get-session", ACME);
			expect(ok.headers.get("access-control-allow-origin")).toBe(ACME);
			const refused = await preflight("/api/auth/get-session", NOBODY);
			expect(refused.headers.get("access-control-allow-origin")).toBeNull();
		});

		it("the super-admin surfaces never answer a team host", async () => {
			for (const path of ["/super-admin/listTeams", "/api/super-admin/listTeams"]) {
				const res = await preflight(path, ACME);
				expect(res.headers.get("access-control-allow-origin"), path).toBeNull();
			}
		});
	});
});
