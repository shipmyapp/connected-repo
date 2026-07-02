import { spawnSync } from "node:child_process";
import { env } from "@backend/configs/env.config";

/**
 * Syncs code-defined workflows in apps/backend/src/novu/ to the Novu instance
 * pointed at by NOVU_API_URL, using the running dev server's bridge endpoint
 * at /api/novu.
 *
 * Prereq: the backend must be running (`yarn dev`) so `npx novu` can hit the
 * bridge and discover workflows.
 *
 * Usage: `yarn novu:sync` (defined in package.json).
 */
const bridgeUrl = `${env.VITE_API_URL}/api/novu`;

if (!env.NOVU_SECRET_KEY) {
	console.error(
		"NOVU_SECRET_KEY is not set. Add it to .env.local and re-run.",
	);
	process.exit(1);
}

const args = ["novu@latest", "sync", "--bridge-url", bridgeUrl];
if (env.NOVU_API_URL) {
	args.push("--api-url", env.NOVU_API_URL);
}

console.info(`Syncing workflows from ${bridgeUrl} → ${env.NOVU_API_URL}`);

// Pass the secret via env, not argv, so it doesn't leak into `ps` output on
// shared hosts. The Novu CLI reads NOVU_SECRET_KEY from the environment
// when --secret-key is absent.
const result = spawnSync("npx", args, {
	stdio: "inherit",
	env: { ...process.env, NOVU_SECRET_KEY: env.NOVU_SECRET_KEY },
});
process.exit(result.status ?? 0);
