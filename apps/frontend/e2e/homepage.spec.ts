import { expect, test } from "./fixtures";

test("homepage loads and redirects appropriately", async ({ page }) => {
	await page.goto("/");
	await page.waitForURL(
		(url) =>
			url.pathname === "/auth/login" ||
			url.pathname === "/dashboard" ||
			url.pathname === "/journal-entries/new",
	);

	const currentURL = page.url();
	if (currentURL.includes("/auth/login")) {
		// Unauthenticated state: should redirect to login
		await expect(page.locator("h3")).toContainText("Welcome");
	} else if (currentURL.includes("/dashboard") || currentURL.includes("/journal-entries/new")) {
		// Authenticated state: should redirect to dashboard or new entry page
		await expect(page.getByRole("link", { name: "Profile and settings" })).toBeVisible();
	}
});

test("the built page links exactly one web app manifest", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator('link[rel~="manifest"]')).toHaveCount(1);
	await expect(page.locator('link[rel~="manifest"]')).toHaveAttribute(
		"href",
		"/manifest.webmanifest",
	);
});

test("the avatar opens the profile page, which holds teams, theme and sign out", async ({
	page,
}) => {
	await page.goto("/dashboard");
	await page.getByRole("link", { name: "Profile and settings" }).click();
	await expect(page).toHaveURL(/\/profile$/);
	await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
	await expect(page.getByRole("button", { name: "New team" })).toBeVisible();
	await expect(page.getByRole("group", { name: "Theme" })).toBeVisible();
	// Exact: the sessions card has "Sign out on …" and "Sign out everywhere else".
	await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
	await expect(page.getByRole("menu")).toHaveCount(0);
});
