import { chromium, devices, webkit } from '@playwright/test';

async function createAuthState<T extends typeof devices>(deviceConfig: T[keyof T], authFilePath: string) {
	const browserType = deviceConfig.defaultBrowserType === 'webkit' ? webkit : chromium;
	const browser = await browserType.launch();
	const context = await browser.newContext(deviceConfig);
	const page = await context.newPage();

	try {
		const baseURL = process.env.VITE_USER_APP_URL;

		// Navigate to login page
		await page.goto(`${baseURL}/auth/login`);

		// Click the Google button which handles test authentication
		await page.locator('text=Continue with Google').click();

		// Wait for redirect to dashboard or journal-entries/new (first-run redirect)
		await page.waitForURL(/\/(dashboard|journal-entries\/new)/);

		// Webkit/Safari fix: wait for network to settle and a small grace period for cookies
		await page.waitForLoadState('networkidle');
		await new Promise(r => setTimeout(r, 1000));

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
			createAuthState(devices["Desktop Chrome"], 'e2e/.auth/desktop-chrome-user.json'),

			...(isCI
				? []
				: [
						// Mobile Chrome auth state
						createAuthState(devices["Pixel 5"], 'e2e/.auth/mobile-chrome-user.json'),
						// Mobile Safari auth state
						createAuthState(devices["iPhone 12"], 'e2e/.auth/mobile-safari-user.json'),
					]),
		]);

		console.info('✅ E2E auth states created successfully');
	} catch (error) {
		console.error('❌ E2E Global Setup Failed:');
		console.error('Error during authentication setup for E2E tests');
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