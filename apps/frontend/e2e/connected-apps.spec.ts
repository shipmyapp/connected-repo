import { createHash, randomBytes } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { setupPwaDismissal } from "./playwright.utils";

/**
 * Connected apps: an AI app registers itself and sends the person to
 * authorize; the consent screen names the platform and lets them leave out
 * writing; Connect returns to the app with a code, and the profile lists the
 * connection.
 */
const API = process.env.VITE_API_URL ?? "http://localhost:3001";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const HEADING = "Connect Claude to your OneQ account?";

const registerClaude = async (request: APIRequestContext) => {
	const registered = await request.post(`${API}/api/auth/oauth2/register`, {
		data: {
			client_name: "Claude",
			redirect_uris: [REDIRECT],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
		},
	});
	expect(registered.status()).toBe(201);
	return ((await registered.json()) as { client_id: string }).client_id;
};

const authorizeQuery = (clientId: string, state: string) =>
	new URLSearchParams({
		response_type: "code",
		client_id: clientId,
		redirect_uri: REDIRECT,
		scope: "read write offline_access",
		state,
		code_challenge: createHash("sha256")
			.update(randomBytes(32).toString("base64url"))
			.digest("base64url"),
		code_challenge_method: "S256",
		resource: `${API}/mcp`,
	});

/** The app's callback is not reachable from the test; catch the redirect there. */
const catchCallback = async (page: Page) => {
	const caught: { url: URL | null } = { url: null };
	await page.route("https://claude.ai/**", async (route) => {
		caught.url = new URL(route.request().url());
		await route.fulfill({ status: 200, contentType: "text/html", body: "<p>back in Claude</p>" });
	});
	return caught;
};

test("an AI app is connected through the consent screen and shows on the profile", async ({
	page,
	request,
}) => {
	const clientId = await registerClaude(request);
	const callback = await catchCallback(page);

	await page.goto(`${API}/api/auth/oauth2/authorize?${authorizeQuery(clientId, "e2e")}`);
	await page.waitForURL("**/oauth/consent?**");
	const consent = page.getByTestId("oauth-consent");
	await expect(consent.getByRole("heading", { name: HEADING })).toBeVisible();
	await expect(consent.getByText("After you connect, you go back to claude.ai.")).toBeVisible();

	// Writing is the person's choice: leave it out.
	await consent.getByLabel(/Add journal entries/).click();
	await consent.getByRole("button", { name: "Connect", exact: true }).click();
	await expect.poll(() => callback.url?.searchParams.get("state") ?? null).toBe("e2e");
	expect(callback.url?.searchParams.get("code")).toBeTruthy();

	await page.goto("/profile");
	const app = page.getByTestId("connected-app").first();
	await expect(app.getByText("Claude", { exact: true })).toBeVisible();
	await expect(app.getByText(/See your teams/)).toBeVisible();
	await expect(app.getByText(/Add journal entries/)).toHaveCount(0);
	await expect(page.getByTestId("connected-apps-address")).toHaveText(`${API}/mcp`);
});

test("a person who is signed out signs in first and comes back to the consent screen", async ({
	browser,
	request,
}) => {
	const clientId = await registerClaude(request);

	// No stored sign-in, as in the window an AI app opens: the project's saved
	// sign-in is applied to every context made from `browser`, so it is emptied.
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	await setupPwaDismissal(context);
	const page = await context.newPage();
	const callback = await catchCallback(page);

	await page.goto(`${API}/api/auth/oauth2/authorize?${authorizeQuery(clientId, "signed-out")}`);
	// Sent to sign in, the request kept in the address.
	await page.waitForURL("**/auth/login?**");
	expect(new URL(page.url()).searchParams.get("client_id")).toBe(clientId);
	// The test build's "Continue with Google" signs up and in by email, then goes
	// to callbackURL: the authorize URL, so the person comes back to the consent
	// screen, not the dashboard.
	// (Two navigations to that URL race: the auth client's own redirect and the
	// page's. One is aborted, so poll the address rather than wait for a load.)
	await page.getByText("Continue with Google").click();
	await expect(page).toHaveURL(/\/oauth\/consent\?/, { timeout: 15_000 });
	const consent = page.getByTestId("oauth-consent");
	await expect(consent.getByRole("heading", { name: HEADING })).toBeVisible();
	await consent.getByRole("button", { name: "Connect", exact: true }).click();
	await expect.poll(() => callback.url?.searchParams.get("state") ?? null).toBe("signed-out");
	expect(callback.url?.searchParams.get("code")).toBeTruthy();
	await context.close();
});
