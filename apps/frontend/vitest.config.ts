import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Standalone vitest config (does NOT load vite.config.ts, which pulls in the
// PWA plugin + build-time env validation that unit tests don't need). Pure
// logic (sync/merge helpers, utils) runs in node — no DOM, no Dexie, no
// workers. Component tests opt into jsdom with the
// `// @vitest-environment jsdom` pragma and render through
// `src/test/render.tsx`.
export default defineConfig({
	resolve: {
		alias: {
			"@frontend": path.resolve(__dirname, "./src"),
		},
	},
	esbuild: { jsx: "automatic" },
	test: {
		environment: "node",
		setupFiles: ["./src/test/setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
		// e2e specs are Playwright, not vitest.
		exclude: ["e2e/**", "node_modules/**", "**/*.spec.ts"],
	},
});
