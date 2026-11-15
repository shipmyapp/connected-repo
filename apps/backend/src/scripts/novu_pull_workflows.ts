import path from "node:path";
import { pullDashboard } from "@backend/novu/dashboard_pull";
import { appUrlFromArgs, novuFromShell } from "@backend/novu/dashboard_snapshot";

/**
 * Pulls every workflow from one Novu environment into
 * src/novu/workflows/<id>.workflow.ts and every email layout into
 * src/novu/layouts/<id>.layout.ts, with `updatedAt` set to the
 * dashboard's, and rewrites both indexes, so the code holds what the dashboard
 * holds. At boot ensureNovuWorkflows then finds the two equal and leaves
 * Novu alone; a later hand edit (with a later `updatedAt`) wins.
 *
 * Reads only the shell's environment (never .env files, whose local key
 * would win over the one you mean):
 *
 *   NOVU_SECRET_KEY=<the environment's secret key> \
 *   NOVU_API_URL=https://api.novu.co \
 *   yarn novu:pull --app-url https://app.example.com
 *
 * `--app-url` is the origin of the app that environment sends people to;
 * it is written back as `${input.appUrl}` so each environment links to its
 * own host. Workflow files in code but not in Novu are left and listed.
 *
 * How to run it end to end: .agent/skills/novu-pull/SKILL.md.
 */
const main = async () => {
	// `yarn novu:pull` runs in apps/backend.
	const novuDir = path.resolve(process.cwd(), "src/novu");
	const { workflows: w, layouts: l } = await pullDashboard(
		novuFromShell(),
		appUrlFromArgs(),
		novuDir,
	);
	console.info(
		`\n${w.pulled} workflow(s) pulled, ${w.inCode} in code; ${l.pulled} layout(s) pulled, ${l.inCode} in code.` +
			"\nReview: git diff -- apps/backend/src/novu",
	);
};

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
