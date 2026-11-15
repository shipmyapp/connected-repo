import { templateProblems } from "@backend/novu/check_templates";
import { novuLayouts } from "@backend/novu/layouts";
import { novuWorkflows } from "@backend/novu/workflows";

// `yarn novu:check`, and the first step of `yarn build`: fails on anything in
// the templates Novu would refuse or mark "Action required" at the next boot.
const problems = templateProblems(novuWorkflows, novuLayouts);
if (problems.length > 0) {
	console.error(
		`Novu templates: ${problems.length} problem(s) Novu would flag:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
	);
	process.exit(1);
}
console.log(
	`Novu templates: ${novuWorkflows.length} workflows and ${novuLayouts.length} layout(s) pass Novu's checks.`,
);
