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

test("the avatar opens the profile page, which holds teams, theme and sign out", async ({
	page,
}) => {
	await page.goto("/dashboard");
	await page.getByRole("link", { name: "Profile and settings" }).click();
	await expect(page).toHaveURL(/\/profile$/);
	await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
	await expect(page.getByRole("button", { name: "New team" })).toBeVisible();
	await expect(page.getByRole("group", { name: "Theme" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
	await expect(page.getByRole("menu")).toHaveCount(0);
});
