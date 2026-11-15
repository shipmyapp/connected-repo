import { dashboardStatus } from "@backend/novu/dashboard_status";
import { novuLayouts } from "@backend/novu/layouts";
import { novuWorkflows } from "@backend/novu/workflows";
import { testPushWorkflow } from "@backend/novu/workflows/test_push.workflow";
import {
	asInDashboard,
	fakeDashboard,
	layoutAsInDashboard,
} from "@backend/test/utils/novu_dashboard.utils";
import { describe, expect, it } from "vitest";

const appUrl = "https://app.example.com";
const code = { workflows: novuWorkflows, layouts: novuLayouts };
const later = (iso: string, days: number) =>
	new Date(Date.parse(iso) + days * 86_400_000).toISOString();

/** The dashboard holding exactly what the code holds. */
const matching = () => ({
	workflows: novuWorkflows.map((w) => asInDashboard(w, appUrl)),
	layouts: novuLayouts.map((l) => layoutAsInDashboard(l, appUrl)),
});

describe("novu:status", () => {
	it("reports every workflow and layout in sync when the dashboard holds the code", async () => {
		const report = await dashboardStatus(fakeDashboard(matching()), appUrl, code);
		expect(report.differs).toBe(false);
		expect(report.lines).toHaveLength(novuWorkflows.length + novuLayouts.length);
		for (const line of report.lines) expect(line).toMatch(/: in sync$/);
	});

	it("names a dashboard edit made after the code, by whom and which field", async () => {
		const dashboard = matching();
		const edited = asInDashboard(testPushWorkflow, appUrl, later(testPushWorkflow.updatedAt, 1));
		const push = edited.definition.steps.find((s) => s.stepId === "send-push");
		if (!push) throw new Error("no push step");
		push.controlValues = { subject: "Ping: {{payload.title}}", body: "{{payload.body}}" };
		edited.updatedBy = { firstName: "Grace", lastName: "Hopper" };
		dashboard.workflows = dashboard.workflows.map((w) =>
			w.workflowId === "test-push" ? edited : w,
		);

		const report = await dashboardStatus(fakeDashboard(dashboard), appUrl, code);
		expect(report.differs).toBe(true);
		const text = report.lines.join("\n");
		expect(text).toContain("workflow test-push: EDITED IN THE DASHBOARD by Grace Hopper");
		expect(text).toContain("steps[send-push].controlValues.subject");
		expect(text).toContain("Ping: {{payload.title}}");
		expect(text).toContain("workflow user-created: in sync");
	});

	it("says when the code is newer and the next boot overwrites the dashboard", async () => {
		const dashboard = matching();
		const older = asInDashboard(testPushWorkflow, appUrl, "2020-01-01T00:00:00.000Z");
		older.definition.name = "Old name";
		dashboard.workflows = dashboard.workflows.map((w) =>
			w.workflowId === "test-push" ? older : w,
		);
		const report = await dashboardStatus(fakeDashboard(dashboard), appUrl, code);
		expect(report.lines.join("\n")).toContain("workflow test-push: CODE IS NEWER");
		expect(report.differs).toBe(true);
	});

	it("lists what exists on one side only, and bridge-made workflows", async () => {
		const dashboard = matching();
		dashboard.workflows = dashboard.workflows.filter((w) => w.workflowId !== "user-created");
		dashboard.workflows.push({
			...asInDashboard(testPushWorkflow, appUrl),
			workflowId: "made-in-dashboard",
		});
		dashboard.workflows = dashboard.workflows.map((w) =>
			w.workflowId === "user-reminder" ? { ...w, origin: "external" } : w,
		);
		dashboard.layouts = [];

		const report = await dashboardStatus(fakeDashboard(dashboard), appUrl, code);
		const text = report.lines.join("\n");
		expect(report.differs).toBe(true);
		expect(text).toContain("workflow user-created: only in code");
		expect(text).toContain("workflow made-in-dashboard: only in the dashboard");
		expect(text).toContain("workflow user-reminder: defined by the old bridge");
		expect(text).toContain("layout app: only in code");
	});

	it("reads every page of a long list", async () => {
		const many = Array.from({ length: 150 }, (_, i) => ({
			...asInDashboard(testPushWorkflow, appUrl),
			workflowId: `wf-${String(i).padStart(3, "0")}`,
		}));
		const report = await dashboardStatus(fakeDashboard({ workflows: many }), appUrl, {
			workflows: [],
			layouts: [],
		});
		expect(report.lines).toHaveLength(150);
	});
});
