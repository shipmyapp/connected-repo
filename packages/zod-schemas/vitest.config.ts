import { defineConfig } from "vitest/config";

// Pure rules only (src/devices/*.rules.ts): no DOM, no database.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
