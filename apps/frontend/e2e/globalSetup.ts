import { type BrowserContext, chromium, devices, webkit } from "@playwright/test";

const SESSION_COOKIE_SUFFIX = "session_token";
const COOKIE_POLL_MS = 100;
const COOKIE_TIMEOUT_MS = 10_000;

async function waitForSessionCookie(context: BrowserContext) {
	const deadline = Date.now() + COOKIE_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const cookies = await context.cookies();
		if (cookies.some((cookie) => cookie.name.endsWith(SESSION_COOKIE_SUFFIX))) return;
		await new Promise((r) => setTimeout(r, COOKIE_POLL_MS));
	}
	throw new Error("The session cookie was never stored after sign-in.");
}

async function createAuthState<T extends typeof devices>(
	deviceConfig: T[keyof T],
	authFilePath: string,
) {
	const browserType = deviceConfig.defaultBrowserType === "webkit" ? webkit : chromium;
	const browser = await browserType.launch();
	const context = await browser.newContext(deviceConfig);
	const page = await context.newPage();

	try {
		const baseURL = process.env.VITE_USER_APP_URL;

		// Navigate to login page
		await page.goto(`${baseURL}/auth/login`);

		// Click the Google button which handles test authentication
		await page.locator("text=Continue with Google").click();

		// Wait for redirect to dashboard or journal-entries/new (first-run redirect)
		await page.waitForURL(/\/(dashboard|journal-entries\/new|legal\/accept)/);
		// Builds that publish Terms and Privacy ask once per account.
		if (page.url().includes("/legal/accept")) {
			await page.getByRole("button", { name: "Agree and continue" }).click();
			await page.waitForURL(/\/(dashboard|journal-entries\/new)/);
		}

		// Webkit can report the page ready before it has stored the session
		// cookie, so wait for the cookie itself. Not 'networkidle': the sync
		// engine's pull cycles and uploads keep the network busy.
		await waitForSessionCookie(context);

		// Save the authenticated state
		await context.storageState({ path: authFilePath });

		console.info(`✅ Auth state saved for ${authFilePath}`);
	} finally {
		await browser.close();
	}
}

async function globalSetup() {
	try {
		// In CI the mobile projects are skipped (see playwright.config.ts), so we
		// only need the Desktop Chrome auth state — and only chromium has to be
		// installed. Locally we create all three (Mobile Safari needs webkit).
		const isCI = process.env.CI === "true";
		await Promise.all([
			// Desktop Chrome auth state
			createAuthState(devices["Desktop Chrome"], "e2e/.auth/desktop-chrome-user.json"),

			...(isCI
				? []
				: [
						// Mobile Chrome auth state
						createAuthState(devices["Pixel 5"], "e2e/.auth/mobile-chrome-user.json"),
						// Mobile Safari auth state
						createAuthState(devices["iPhone 12"], "e2e/.auth/mobile-safari-user.json"),
					]),
		]);

		console.info("✅ E2E auth states created successfully");
	} catch (error) {
		console.error("❌ E2E Global Setup Failed:");
		console.error("Error during authentication setup for E2E tests");
		console.info("Try building the frontend app in test mode before running E2E tests:");
		if (error instanceof Error) {
			console.error(`Error message: ${error.message}`);
			console.error(`Error stack: ${error.stack}`);
		} else {
			console.error(`Unknown error: ${error}`);
		}
		throw error;
	}
}

export default globalSetup;
