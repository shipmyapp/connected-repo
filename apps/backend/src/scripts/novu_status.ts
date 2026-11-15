import { appUrlFromArgs, novuFromShell } from "@backend/novu/dashboard_snapshot";
import { dashboardStatus } from "@backend/novu/dashboard_status";
import { novuLayouts } from "@backend/novu/layouts";
import { novuWorkflows } from "@backend/novu/workflows";

/**
 * Says, without writing anything, how one Novu environment's workflows
 * and email layouts stand against the code in src/novu/workflows and
 * src/novu/layouts: which were edited in the
 * dashboard (by whom, when, and what changed), which the code would
 * overwrite at the next boot, and which exist on one side only. Run it
 * before any change to a workflow, and tell the user what it says.
 *
 *   NOVU_SECRET_KEY=<key> NOVU_API_URL=https://api.novu.co \
 *   yarn novu:status --app-url https://app.example.com
 *
 * Exit code 0 when the two match, 2 when anything differs.
 */
const main = async () => {
	const report = await dashboardStatus(novuFromShell(), appUrlFromArgs(), {
		workflows: novuWorkflows,
		layouts: novuLayouts,
	});
	console.info(report.lines.join("\n"));
	process.exit(report.differs ? 2 : 0);
};

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
