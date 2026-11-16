import { expect, test } from "./fixtures";

/** What the test build puts on `window.__testHooks` (main.tsx), as far as this spec uses it. */
type DataTestHooks = {
	__testHooks?: {
		getDataProxy?: () => Promise<{ sync: { waitForReady: () => Promise<void> } }>;
	};
};

/**
 * The built service worker installs, takes control of the page and serves
 * the app shell with the network gone: a signed-in person reloads offline
 * and gets the app, with the DataWorker answering from the local database.
 */
test("the service worker installs and the app starts offline", async ({ page, context }) => {
	await page.goto("/journal-entries");
	await expect(page.getByRole("link", { name: "Profile and settings" })).toBeVisible();

	// The page registers the worker once it is idle; `ready` resolves when it is active.
	const scope = await page.evaluate(async () => {
		const registration = await navigator.serviceWorker.ready;
		return registration.scope;
	});
	expect(new URL(scope).pathname).toBe("/");

	// A first visit is not controlled; the next load is.
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);

	await context.setOffline(true);
	try {
		await page.reload();
		await expect(page.getByRole("link", { name: "Profile and settings" })).toBeVisible();
		await page.waitForFunction(
			() => (window as Window & DataTestHooks).__testHooks?.getDataProxy != null,
			null,
			{ timeout: 10_000 },
		);
		const ready = await page.evaluate(async () => {
			const getDataProxy = (window as Window & DataTestHooks).__testHooks?.getDataProxy;
			if (!getDataProxy) throw new Error("the test hooks are not loaded");
			const proxy = await getDataProxy();
			await proxy.sync.waitForReady();
			return true;
		});
		expect(ready).toBe(true);
	} finally {
		await context.setOffline(false);
	}
});
