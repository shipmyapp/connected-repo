import { env } from "@backend/configs/env.config";
import { novu } from "@backend/configs/novu.config";
import type { CodeLayout } from "@backend/novu/code_layout";
import { novuLayouts } from "@backend/novu/layouts";
import { novuWorkflows } from "@backend/novu/workflows";
import { logger } from "@backend/utils/logger.utils";
import type { CreateWorkflowDto, WorkflowResponseDto } from "@novu/api/models/components";
import { NovuError } from "@novu/api/models/errors";

/**
 * Brings the Novu environment NOVU_SECRET_KEY belongs to in line with the
 * workflows in novu/workflows, the newer side winning. Runs once at boot,
 * in the background (on Dokploy: each time the backend container starts).
 *
 * For each workflow in code:
 * - missing in Novu → created from the code;
 * - changed in Novu after the code's `updatedAt` (someone edited it in the
 *   dashboard) → left alone; `yarn novu:pull` brings that edit into code;
 * - code's `updatedAt` later than Novu's → Novu is updated from the code.
 *   Novu's own `updatedAt` then moves to now, so the next boot leaves it.
 *
 * A code `updatedAt` in the future is ignored with a warning: until that
 * time passed, every boot would overwrite whatever the dashboard held.
 *
 * A workflow left from the old code-defined setup (`@novu/framework` over
 * the `/api/novu` bridge, origin `external`) is read-only in the dashboard
 * and rendered by a bridge that is gone, so it is deleted and created again.
 * Its content was in code, so nothing anyone wrote is lost.
 *
 * Email layouts in novu/layouts go first, by the same rule, since an email
 * step names its layout by id.
 *
 * Workflows and layouts in Novu that the code does not have are never
 * touched. Each layout and workflow stands alone: a failure is logged with
 * Novu's reason and the rest go on (a trigger for a missing workflow fails and
 * pg-tbus retries it). A layout may read only `subscriber`, `content`,
 * `context` and `env` (Novu refuses anything else), so the brand is in each body.
 */
export const ensureNovuWorkflows = async (): Promise<void> => {
	if (!novu) return;
	const client = novu;
	const appUrl = new URL(env.WEBAPP_URL).origin;

	// One that fails is logged and the rest go on: a layout Novu refused must
	// not leave every workflow uncreated.
	for (const codeLayout of novuLayouts) {
		const layout = codeLayout.definition({ appUrl });
		await ensureLayout(client, layout, codeLayout.updatedAt).catch((err: unknown) =>
			logger.error(
				{ layoutId: layout.layoutId, novu: novuErrorBody(err), err },
				"Novu: layout not brought in line with code",
			),
		);
	}

	for (const codeWorkflow of novuWorkflows) {
		const definition = codeWorkflow.definition({ appUrl });
		await ensureWorkflow(client, definition, codeWorkflow.updatedAt).catch((err: unknown) =>
			logger.error(
				{ workflowId: definition.workflowId, novu: novuErrorBody(err), err },
				"Novu: workflow not brought in line with code",
			),
		);
	}
};

/** What Novu said when it refused a call (its validation issues are in the body). */
const novuErrorBody = (err: unknown): string | undefined =>
	err instanceof NovuError ? err.body : undefined;

type NovuClient = NonNullable<typeof novu>;

const ensureLayout = async (
	client: NovuClient,
	layout: ReturnType<CodeLayout["definition"]>,
	updatedAt: string,
): Promise<void> => {
	const { layoutId, name, isTranslationEnabled, email } = layout;
	const existing = await client.layouts.retrieve(layoutId).then(
		(res) => res.result,
		(err: unknown) => {
			if (err instanceof NovuError && err.statusCode === 404) return null;
			throw err;
		},
	);
	if (existing && !isCodeNewer(updatedAt, existing.updatedAt, layoutId)) return;
	// Creating takes the id and name only; the HTML goes in with an update.
	if (!existing) {
		await client.layouts.create({ layoutId, name, isTranslationEnabled, source: "dashboard" });
	}
	await client.layouts.update({ name, isTranslationEnabled, controlValues: { email } }, layoutId);
	logger.info(
		{ layoutId },
		existing ? "Novu: updated layout from code (code is newer)" : "Novu: created layout from code",
	);
};

const ensureWorkflow = async (
	client: NovuClient,
	definition: CreateWorkflowDto,
	updatedAt: string,
): Promise<void> => {
	const { workflowId } = definition;
	const existing = await client.workflows.get(workflowId).then(
		(res) => res.result,
		(err: unknown) => {
			if (err instanceof NovuError && err.statusCode === 404) return null;
			throw err;
		},
	);

	if (existing?.origin === "external") {
		await client.workflows.delete(workflowId);
		logger.info({ workflowId }, "Novu: removed the bridge-defined workflow");
	}
	if (!existing || existing.origin === "external") {
		await client.workflows.create(definition);
		logger.info({ workflowId }, "Novu: created workflow from code");
		return;
	}

	if (!isCodeNewer(updatedAt, existing.updatedAt, workflowId)) return;

	const update = updateFrom(definition, existing);
	if (!update) {
		logger.warn(
			{ workflowId },
			"Novu: a throttle step cannot be updated through the API; left alone",
		);
		return;
	}
	await client.workflows.update(update, workflowId);
	logger.info(
		{ workflowId, codeUpdatedAt: updatedAt, novuUpdatedAt: existing.updatedAt },
		"Novu: updated workflow from code (code is newer)",
	);
};

/**
 * Whether the code's copy changed after Novu's. A code time that is not a
 * date or is in the future is ignored with a warning: until that time
 * passed, every boot would overwrite whatever the dashboard held.
 */
const isCodeNewer = (codeUpdatedAt: string, novuUpdatedAt: string, id: string): boolean => {
	const codeAt = Date.parse(codeUpdatedAt);
	if (Number.isNaN(codeAt) || codeAt > Date.now()) {
		logger.warn(
			{ id, updatedAt: codeUpdatedAt },
			"Novu: code updatedAt is invalid or in the future; leaving it alone",
		);
		return false;
	}
	return codeAt > Date.parse(novuUpdatedAt);
};

/**
 * The update for an existing workflow: the code's content, with each step
 * matched to the step Novu already has by `stepId` (so it is updated, not
 * replaced), and the preferences and origin Novu holds. Null when the code
 * has a throttle step, which Novu's update endpoint does not take.
 */
const updateFrom = (definition: CreateWorkflowDto, existing: WorkflowResponseDto) => {
	const stepIds = new Map(existing.steps.map((step) => [step.stepId, step.id]));
	const steps = definition.steps.flatMap((step) =>
		step.type === "throttle"
			? []
			: [{ ...step, id: step.stepId ? stepIds.get(step.stepId) : undefined }],
	);
	if (steps.length !== definition.steps.length) return null;
	return {
		...definition,
		origin: existing.origin,
		preferences: {
			user: existing.preferences.user ?? null,
			workflow: existing.preferences.default,
		},
		steps,
	};
};

export const ensureNovuWorkflowsInBackground = (): void => {
	ensureNovuWorkflows().catch((err: unknown) => {
		logger.error({ err }, "Novu: bringing workflows in line with code failed");
	});
};
