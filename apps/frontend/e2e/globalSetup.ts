import { chromium, devices } from '@playwright/test';

async function createAuthState<T extends typeof devices>(deviceConfig: T[keyof T], authFilePath: string) {
	const browser = await chromium.launch();
	const context = await browser.newContext(deviceConfig);
	const page = await context.newPage();

	try {
		const baseURL = process.env.VITE_USER_APP_URL;

		// Navigate to login page
		await page.goto(`${baseURL}/auth/login`);

		// Click the Google button which handles test authentication
		await page.locator('text=Continue with Google').click();

		// Wait for redirect to dashboard
		await page.waitForURL('**/dashboard');

		// Save the authenticated state
		await context.storageState({ path: authFilePath });

		console.log(`✅ Auth state saved for ${authFilePath}`);
	} finally {
		await browser.close();
	}
}

async function globalSetup() {
	try {
		// Create separate auth states for each browser/project
		await Promise.all([
			// Desktop Chrome auth state
			createAuthState(devices["Desktop Chrome"], 'e2e/.auth/desktop-chrome-user.json'),

			// Mobile Chrome auth state
			createAuthState(devices["Pixel 5"], 'e2e/.auth/mobile-chrome-user.json'),

			// Mobile Safari auth state
			createAuthState(devices["iPhone 12"], 'e2e/.auth/mobile-safari-user.json'),
		]);

		console.log('✅ All E2E auth states created successfully');
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