import { expect, test } from "./fixtures";

// Team hosts are `<slug>.<root>`; the e2e build sets VITE_TENANT_ROOT_DOMAIN
// to localhost (.env.test), and Chromium resolves `*.localhost` to loopback.
test.skip(!process.env.VITE_TENANT_ROOT_DOMAIN, "tenant mode off");

test("a subdomain no team holds is a dead end, not a login form", async ({ page, baseURL }) => {
	if (!baseURL) throw new Error("no baseURL");
	const host = new URL(baseURL);
	host.hostname = `nobody.${process.env.VITE_TENANT_ROOT_DOMAIN}`;

	// The e2e stack calls the API cross-origin (VITE_API_URL), and the API
	// refuses CORS to a host no team holds. Deployed, a team host reaches the
	// API on its own origin; answer the one public lookup the way that
	// same-origin call would.
	await page.route("**/api/user-app/teams/getBrandingBySlug**", async (route) => {
		const response = await route.fetch();
		await route.fulfill({
			response,
			headers: {
				...response.headers(),
				"access-control-allow-origin": host.origin,
				"access-control-allow-credentials": "true",
			},
		});
	});

	await page.goto(host.toString());
	await expect(page.getByText("Workspace not found")).toBeVisible();
	await expect(page.getByText("Continue with Google")).toHaveCount(0);
});
