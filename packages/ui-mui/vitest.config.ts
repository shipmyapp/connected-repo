import { defineConfig } from "vitest/config";

// Pure helpers under src/utils run in node; components are exercised by the apps' jsdom tests.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
