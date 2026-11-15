import { Novu } from "@novu/api";
import type { LayoutResponseDto, WorkflowResponseDto } from "@novu/api/models/components";

/**
 * Reading a Novu environment's workflows from the scripts (`yarn novu:pull`,
 * `yarn novu:status`). Not used by the server: the scripts read only the
 * shell's environment, so a local .env key never wins over the one meant.
 */

/** The part of the Novu client the scripts read with (a fake in tests). */
export type DashboardReader = {
	workflows: Pick<Novu["workflows"], "list" | "get">;
	layouts: Pick<Novu["layouts"], "list" | "retrieve">;
};

export const novuFromShell = (): DashboardReader => {
	const secretKey = process.env.NOVU_SECRET_KEY;
	if (!secretKey) {
		console.error(
			"NOVU_SECRET_KEY is not set in this shell. Run as:\n" +
				"  NOVU_SECRET_KEY=<key> NOVU_API_URL=https://api.novu.co yarn novu:<pull|status>",
		);
		process.exit(1);
	}
	return new Novu({ secretKey, serverURL: process.env.NOVU_API_URL });
};

/** `--app-url <origin>`, the app the environment links to; else WEBAPP_URL from the shell. */
export const appUrlFromArgs = () => {
	const at = process.argv.indexOf("--app-url");
	const value = at === -1 ? process.env.WEBAPP_URL : process.argv[at + 1];
	if (!value) {
		console.error(
			"Pass --app-url <origin of the app this Novu environment links to>, e.g. --app-url https://app.example.com",
		);
		process.exit(1);
	}
	return new URL(value).origin;
};

/** Every workflow in the environment, read whole. */
export const readDashboardWorkflows = async (
	novu: DashboardReader,
): Promise<WorkflowResponseDto[]> => {
	const ids: string[] = [];
	for (let offset = 0; ; offset += 100) {
		const page = await novu.workflows.list({ limit: 100, offset });
		ids.push(...page.result.workflows.map((w) => w.workflowId));
		if (ids.length >= page.result.totalCount || page.result.workflows.length === 0) break;
	}
	const workflows: WorkflowResponseDto[] = [];
	for (const workflowId of ids.sort()) {
		workflows.push((await novu.workflows.get(workflowId)).result);
	}
	return workflows;
};

/** The fields of a workflow that creating or updating it from code needs. */
export const definitionOf = (wf: WorkflowResponseDto) => ({
	workflowId: wf.workflowId,
	name: wf.name,
	description: wf.description,
	tags: wf.tags?.length ? wf.tags : undefined,
	active: wf.active,
	validatePayload: wf.validatePayload,
	payloadSchema: wf.payloadSchema ?? undefined,
	isTranslationEnabled: wf.isTranslationEnabled,
	severity: wf.severity,
	source: "dashboard",
	steps: wf.steps.map((step) => ({
		stepId: step.stepId,
		name: step.name,
		type: step.type,
		controlValues: step.controlValues,
	})),
});

/** Every email layout in the environment. */
export const readDashboardLayouts = async (novu: DashboardReader): Promise<LayoutResponseDto[]> => {
	const ids: string[] = [];
	for (let offset = 0; ; offset += 100) {
		const page = await novu.layouts.list({ limit: 100, offset });
		ids.push(...page.result.layouts.map((l) => l.layoutId));
		if (ids.length >= page.result.totalCount || page.result.layouts.length === 0) break;
	}
	// The list leaves each layout's controls empty; reading one returns them.
	const layouts: LayoutResponseDto[] = [];
	for (const layoutId of ids.sort()) {
		layouts.push((await novu.layouts.retrieve(layoutId)).result);
	}
	return layouts;
};

/** The fields of a layout that creating or updating it from code needs (code_layout.ts). */
export const layoutDefinitionOf = (layout: LayoutResponseDto) => ({
	layoutId: layout.layoutId,
	name: layout.name,
	isTranslationEnabled: layout.isTranslationEnabled,
	email: layout.controls.values.email,
});
