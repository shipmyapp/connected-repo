import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { setupPwaDismissal } from "./playwright.utils";

/**
 * Delete my account from the profile, in a fresh browser with its own new
 * account (never the shared signed-in one): the device keeps nothing of it.
 */
const signInFresh = async (page: Page) => {
	await page.goto("/auth/login");
	await page.getByText("Continue with Google").click();
	await page.waitForURL(/\/(dashboard|journal-entries\/new|legal\/accept)/, { timeout: 15_000 });
	if (page.url().includes("/legal/accept")) {
		await page.getByRole("button", { name: "Agree and continue" }).click();
		await page.waitForURL(/\/(dashboard|journal-entries\/new)/);
	}
};

test("deleting the account from the profile wipes this device's copy", async ({ browser }) => {
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	await setupPwaDismissal(context);
	const page = await context.newPage();
	await signInFresh(page);

	await page.goto("/profile");
	await expect(page.getByTestId("session-current").getByText("This device")).toBeVisible();

	// The app opened this account's local database on sign-in.
	await expect
		.poll(() =>
			page.evaluate(async () =>
				(await indexedDB.databases()).some((d) => d.name?.startsWith("app_db_v1_")),
			),
		)
		.toBe(true);

	await page.getByRole("button", { name: "Delete my account" }).click();
	await page
		.getByRole("dialog", { name: "Delete your account?" })
		.getByRole("button", { name: "Delete my account" })
		.click();
	await page.waitForURL(/\/auth\/login/, { timeout: 20_000 });

	const names = await page.evaluate(async () =>
		(await indexedDB.databases()).map((d) => d.name ?? ""),
	);
	expect(names.filter((n) => n.startsWith("app_db_v1_"))).toEqual([]);
	expect(await page.evaluate(() => localStorage.getItem("auth_session_cache"))).toBeNull();
	await context.close();
});
