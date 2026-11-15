import type { CodeLayout } from "@backend/novu/code_layout";
import type { CodeWorkflow } from "@backend/novu/code_workflow";
import type { DashboardReader } from "@backend/novu/dashboard_snapshot";
import { vi } from "vitest";

/**
 * A Novu environment for the script tests: a fake of the client calls the
 * scripts read with (`DashboardReader`), holding what the dashboard holds.
 */

type DashboardWorkflow = {
	workflowId: string;
	updatedAt: string;
	origin?: string;
	updatedBy?: { firstName?: string; lastName?: string } | null;
	definition: Record<string, unknown> & { steps: Record<string, unknown>[] };
};

type DashboardLayout = {
	layoutId: string;
	updatedAt: string;
	updatedBy?: { firstName?: string; lastName?: string } | null;
	definition: { name: string; isTranslationEnabled?: boolean; email: unknown };
};

export const fakeDashboard = (dashboard: {
	workflows?: DashboardWorkflow[];
	layouts?: DashboardLayout[];
}): DashboardReader => {
	const workflows = dashboard.workflows ?? [];
	const layouts = dashboard.layouts ?? [];
	const fake = {
		workflows: { list: vi.fn(), get: vi.fn() },
		layouts: { list: vi.fn(), retrieve: vi.fn() },
	};
	fake.workflows.list.mockImplementation(async ({ offset = 0, limit = 100 }) => ({
		result: {
			workflows: workflows.slice(offset, offset + limit).map((w) => ({ workflowId: w.workflowId })),
			totalCount: workflows.length,
		},
	}));
	fake.workflows.get.mockImplementation(async (workflowId: string) => {
		const w = workflows.find((x) => x.workflowId === workflowId);
		if (!w) throw new Error(`no workflow ${workflowId}`);
		return {
			result: {
				...w.definition,
				id: `id-${workflowId}`,
				workflowId,
				origin: w.origin ?? "novu-cloud",
				updatedAt: w.updatedAt,
				updatedBy: w.updatedBy ?? null,
				// Novu answers with more per step than the code holds.
				steps: w.definition.steps.map((step, i) => ({ ...step, id: `step-${i}` })),
			},
		};
	});
	fake.layouts.list.mockImplementation(async ({ offset = 0, limit = 100 }) => ({
		result: {
			// The list leaves each layout's controls empty.
			layouts: layouts.slice(offset, offset + limit).map((l) => ({ layoutId: l.layoutId })),
			totalCount: layouts.length,
		},
	}));
	fake.layouts.retrieve.mockImplementation(async (layoutId: string) => {
		const l = layouts.find((x) => x.layoutId === layoutId);
		if (!l) throw new Error(`no layout ${layoutId}`);
		return {
			result: {
				layoutId,
				name: l.definition.name,
				isTranslationEnabled: l.definition.isTranslationEnabled,
				updatedAt: l.updatedAt,
				updatedBy: l.updatedBy ?? null,
				controls: { values: { email: l.definition.email } },
			},
		};
	});
	return fake;
};

/** What the dashboard holds when it matches a workflow in code. */
export const asInDashboard = (
	code: CodeWorkflow,
	appUrl: string,
	updatedAt = code.updatedAt,
): DashboardWorkflow => {
	const definition = code.definition({ appUrl });
	return {
		workflowId: definition.workflowId,
		updatedAt,
		definition: { ...definition, steps: definition.steps.map((step) => ({ ...step })) },
	};
};

/** What the dashboard holds when it matches a layout in code. */
export const layoutAsInDashboard = (
	code: CodeLayout,
	appUrl: string,
	updatedAt = code.updatedAt,
): DashboardLayout => {
	const { layoutId, ...definition } = code.definition({ appUrl });
	return { layoutId, updatedAt, definition };
};
