import type { CodeLayout } from "@backend/novu/code_layout";
import type { CodeWorkflow } from "@backend/novu/code_workflow";
import { NovuError } from "@novu/api/models/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake Novu client at the boundary ensureNovuWorkflows talks to
// (configs/novu.config.ts), and the code's workflows and layouts.
const h = vi.hoisted(() => ({
	client: {
		workflows: { get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
		layouts: { retrieve: vi.fn(), create: vi.fn(), update: vi.fn() },
	},
	workflows: [] as CodeWorkflow[],
	layouts: [] as CodeLayout[],
}));
vi.mock("@backend/configs/novu.config", () => ({ novu: h.client }));
vi.mock("@backend/novu/workflows", () => ({ novuWorkflows: h.workflows }));
vi.mock("@backend/novu/layouts", () => ({ novuLayouts: h.layouts }));

import { ensureNovuWorkflows } from "@backend/novu/ensure_workflows";

const novuError = (status: number) =>
	new NovuError("novu", {
		response: new Response("{}", { status }),
		request: new Request("https://novu.test"),
		body: "{}",
	});

const wf = (workflowId: string, updatedAt: string): CodeWorkflow => ({
	updatedAt,
	definition: () => ({
		workflowId,
		name: workflowId,
		source: "dashboard",
		steps: [
			{
				stepId: "send-push",
				name: "Push",
				type: "push",
				controlValues: { subject: "s", body: "b" },
			},
		],
	}),
});

const inNovu = (workflowId: string, updatedAt: string, origin = "novu-cloud") => ({
	result: {
		workflowId,
		origin,
		updatedAt,
		steps: [{ stepId: "send-push", id: "step-1" }],
		preferences: { user: null, default: { all: { enabled: true }, channels: {} } },
	},
});

const appLayout = (updatedAt: string): CodeLayout => ({
	updatedAt,
	definition: () => ({
		layoutId: "app",
		name: "App",
		isTranslationEnabled: false,
		email: { body: "<html><body>{{content}}</body></html>", editorType: "html" },
	}),
});

describe("ensureNovuWorkflows: the newer of code and dashboard wins", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		h.workflows.length = 0;
		h.layouts.length = 0;
		for (const fn of [
			h.client.workflows.create,
			h.client.workflows.update,
			h.client.workflows.delete,
			h.client.layouts.create,
			h.client.layouts.update,
		]) {
			fn.mockResolvedValue({});
		}
	});

	it("creates a workflow Novu does not have", async () => {
		h.workflows.push(wf("wf-a", "2026-01-01T00:00:00.000Z"));
		h.client.workflows.get.mockRejectedValue(novuError(404));
		await ensureNovuWorkflows();
		expect(h.client.workflows.create).toHaveBeenCalledWith(
			expect.objectContaining({ workflowId: "wf-a" }),
		);
		expect(h.client.workflows.update).not.toHaveBeenCalled();
	});

	it("leaves a workflow edited in the dashboard after the code", async () => {
		h.workflows.push(wf("wf-a", "2026-01-01T00:00:00.000Z"));
		h.client.workflows.get.mockResolvedValue(inNovu("wf-a", "2026-02-01T00:00:00.000Z"));
		await ensureNovuWorkflows();
		expect(h.client.workflows.create).not.toHaveBeenCalled();
		expect(h.client.workflows.update).not.toHaveBeenCalled();
		expect(h.client.workflows.delete).not.toHaveBeenCalled();
	});

	it("updates Novu when the code is newer, matching steps by stepId and keeping preferences", async () => {
		h.workflows.push(wf("wf-a", "2026-02-01T00:00:00.000Z"));
		h.client.workflows.get.mockResolvedValue(inNovu("wf-a", "2026-01-01T00:00:00.000Z"));
		await ensureNovuWorkflows();
		const [update, id] = h.client.workflows.update.mock.calls[0] ?? [];
		expect(id).toBe("wf-a");
		expect(update.steps[0].id).toBe("step-1");
		expect(update.preferences).toEqual({
			user: null,
			workflow: { all: { enabled: true }, channels: {} },
		});
		expect(h.client.workflows.create).not.toHaveBeenCalled();
	});

	it("ignores a code updatedAt in the future", async () => {
		h.workflows.push(wf("wf-a", new Date(Date.now() + 86_400_000).toISOString()));
		h.client.workflows.get.mockResolvedValue(inNovu("wf-a", "2026-01-01T00:00:00.000Z"));
		await ensureNovuWorkflows();
		expect(h.client.workflows.update).not.toHaveBeenCalled();
	});

	it("ignores a code updatedAt that is not a date", async () => {
		h.workflows.push(wf("wf-a", "yesterday"));
		h.client.workflows.get.mockResolvedValue(inNovu("wf-a", "2026-01-01T00:00:00.000Z"));
		await ensureNovuWorkflows();
		expect(h.client.workflows.update).not.toHaveBeenCalled();
	});

	it("replaces a workflow left by the old bridge", async () => {
		h.workflows.push(wf("wf-a", "2026-01-01T00:00:00.000Z"));
		h.client.workflows.get.mockResolvedValue(
			inNovu("wf-a", "2026-02-01T00:00:00.000Z", "external"),
		);
		await ensureNovuWorkflows();
		expect(h.client.workflows.delete).toHaveBeenCalledWith("wf-a");
		expect(h.client.workflows.create).toHaveBeenCalledTimes(1);
	});

	it("goes on with the rest when one workflow fails", async () => {
		h.workflows.push(
			wf("wf-a", "2026-01-01T00:00:00.000Z"),
			wf("wf-b", "2026-01-01T00:00:00.000Z"),
		);
		h.client.workflows.get.mockImplementation(async (id: string) => {
			throw novuError(id === "wf-a" ? 500 : 404);
		});
		await ensureNovuWorkflows();
		expect(h.client.workflows.create).toHaveBeenCalledTimes(1);
		expect(h.client.workflows.create).toHaveBeenCalledWith(
			expect.objectContaining({ workflowId: "wf-b" }),
		);
	});

	it("still creates the workflows when Novu refuses a layout", async () => {
		h.layouts.push(appLayout("2026-01-01T00:00:00.000Z"));
		h.workflows.push(wf("wf-a", "2026-01-01T00:00:00.000Z"));
		h.client.layouts.retrieve.mockRejectedValue(novuError(404));
		h.client.layouts.create.mockRejectedValue(novuError(422));
		h.client.workflows.get.mockRejectedValue(novuError(404));
		await ensureNovuWorkflows();
		expect(h.client.workflows.create).toHaveBeenCalledWith(
			expect.objectContaining({ workflowId: "wf-a" }),
		);
	});

	it("creates a missing layout, then fills its HTML", async () => {
		h.layouts.push(appLayout("2026-01-01T00:00:00.000Z"));
		h.client.layouts.retrieve.mockRejectedValue(novuError(404));
		await ensureNovuWorkflows();
		expect(h.client.layouts.create).toHaveBeenCalledWith(
			expect.objectContaining({ layoutId: "app" }),
		);
		expect(h.client.layouts.update).toHaveBeenCalledWith(
			expect.objectContaining({
				controlValues: { email: expect.objectContaining({ editorType: "html" }) },
			}),
			"app",
		);
	});

	it("leaves a layout edited in the dashboard after the code", async () => {
		h.layouts.push(appLayout("2026-01-01T00:00:00.000Z"));
		h.client.layouts.retrieve.mockResolvedValue({
			result: { layoutId: "app", updatedAt: "2026-02-01T00:00:00.000Z" },
		});
		await ensureNovuWorkflows();
		expect(h.client.layouts.create).not.toHaveBeenCalled();
		expect(h.client.layouts.update).not.toHaveBeenCalled();
	});
});
