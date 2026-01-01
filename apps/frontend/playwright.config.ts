import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.test (or .env based on NODE_ENV)
const envTestLocal = path.resolve(__dirname, ".env.test.local");
const envTest = path.resolve(__dirname, ".env.test");
dotenv.config({
  path: fs.existsSync(envTestLocal) ? envTestLocal : envTest,
});

const isCI = process.env.CI === "true";
const isUIMode = !isCI && process.argv.includes("--ui");
const isDebug =
  !isCI &&
  (process.env.DEBUG === "true" ||
    process.argv.includes("--debug") ||
    process.argv.includes("--headed"));

export default defineConfig({
	testDir: "./",
  outputDir: "./e2e/test-results",
	globalSetup: "./e2e/globalSetup.ts",
	fullyParallel: !isUIMode,
	forbidOnly: isCI,
	retries: process.env.CI ? 2 : 0,
	workers: isCI ? 1 : isUIMode ? 1 : undefined,
	reporter: [
		[
      "html",
      {
        outputFolder: "e2e/playwright-report",
        open: isDebug || isUIMode ? "always" : "never",
      },
    ],
    ["list"],
    // Add JSON reporter for better CI integration
    ...(isCI ? [["json", { outputFile: "e2e/playwright-report/results.json" }] as const] : []),
	],
  timeout: isDebug || isUIMode ? 0 : 10000,
  expect: {
    timeout: isDebug || isUIMode ? 0 : 5000,
  },
	use: {
		baseURL: process.env.VITE_USER_APP_URL,
    trace: isCI ? "on-first-retry" : "retain-on-failure", // More detailed tracing in local
    screenshot: "only-on-failure",
    // video: "retain-on-failure",
    launchOptions: {
      args:
        isDebug || isUIMode
          ? ["--start-maximized"]
          : ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
      devtools: isDebug || isUIMode,
      headless: !(isDebug || isUIMode),
      slowMo: isDebug || isUIMode ? 1000 : 0,
    },

    // Keep browser open on test failure in debug mode or UI mode
    ...((isDebug || isUIMode) && {
      actionTimeout: 0,
      navigationTimeout: 0,
    }),
	},
  projects: [
  		{
  			name: "Desktop Chrome",
  			testMatch: "**/*.spec.ts",
  			testIgnore: "**/auth.spec.ts",
  			use: {
  				...devices["Desktop Chrome"],
  				storageState: "./e2e/.auth/desktop-chrome-user.json",
  			},
  		},
  		{
  			name: "auth-test",
  			testMatch: "**/auth.spec.ts",
  			use: { ...devices["Desktop Chrome"] },
  		},
    ...(isCI
      ? []
      : [
           {
             name: "Mobile Chrome",
             testMatch: "**/*.spec.ts",
             testIgnore: "**/auth.spec.ts",
             use: {
               ...devices["Pixel 5"],
               storageState: "./e2e/.auth/mobile-chrome-user.json",
             },
           },
           {
             name: "Mobile Safari",
             testMatch: "**/*.spec.ts",
             testIgnore: "**/auth.spec.ts",
             use: {
               ...devices["iPhone 12"],
               storageState: "./e2e/.auth/mobile-safari-user.json",
             },
           },
        ]),
 	],
	webServer: [
    // To start the backend test server
    {
      command: "yarn workspace @connected-repo/backend test:server:start",
      url: process.env.VITE_API_URL,
      timeout: 120 * 1000, // Max wait for frontend to be ready (e.g., 120 seconds)
      reuseExistingServer: !isCI, // Reuse if not in CI
      stdout: "pipe", // Show server logs for debugging
      stderr: "pipe",
      wait: {
        stdout: /Server running/i, // Wait for this specific message in stdout
      }
      // ignoreHTTPSErrors: true,
    },
    // To start the frontend test server
    {
      command: "vite preview --mode test --port 5174 --strictPort --host", // Build first, then start preview server
      url: process.env.VITE_USER_APP_URL, // URL to wait for the frontend
      timeout: 120 * 1000, // Max wait for frontend to be ready (e.g., 120 seconds)
      reuseExistingServer: false, // Always start a new server for frontend
      stdout: "pipe", // Show server logs for debugging
      stderr: "pipe",
      // ignoreHTTPSErrors: true,
	  },
  ],
});
