import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pullDashboard } from "@backend/novu/dashboard_pull";
import { novuLayouts } from "@backend/novu/layouts";
import { novuWorkflows } from "@backend/novu/workflows";
import { testPushWorkflow } from "@backend/novu/workflows/test_push.workflow";
import {
	asInDashboard,
	fakeDashboard,
	layoutAsInDashboard,
} from "@backend/test/utils/novu_dashboard.utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const appUrl = "https://app.example.com";
const NOVU_DIR = path.resolve(__dirname);

let dir: string;
beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "novu-pull-"));
});
afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

const read = (...parts: string[]) => fs.readFileSync(path.join(...parts), "utf8");
const filesIn = (root: string, kind: string) =>
	fs.readdirSync(path.join(root, kind)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("novu:pull", () => {
	it("writes back exactly the files in src/novu when the dashboard holds the code", async () => {
		const result = await pullDashboard(
			fakeDashboard({
				workflows: novuWorkflows.map((w) => asInDashboard(w, appUrl)),
				layouts: novuLayouts.map((l) => layoutAsInDashboard(l, appUrl)),
			}),
			appUrl,
			dir,
		);
		expect(result.workflows).toEqual({
			pulled: novuWorkflows.length,
			inCode: novuWorkflows.length,
		});
		expect(result.layouts).toEqual({ pulled: novuLayouts.length, inCode: novuLayouts.length });
		for (const kind of ["workflows", "layouts"]) {
			expect(filesIn(dir, kind).sort()).toEqual(filesIn(NOVU_DIR, kind).sort());
			for (const file of filesIn(NOVU_DIR, kind)) {
				expect(read(dir, kind, file), `${kind}/${file}`).toBe(read(NOVU_DIR, kind, file));
			}
		}
	});

	it("takes the dashboard's updatedAt and writes the app origin as input.appUrl", async () => {
		const edited = asInDashboard(testPushWorkflow, appUrl, "2026-03-04T05:06:07.000Z");
		const push = edited.definition.steps.find((s) => s.stepId === "send-push");
		if (!push) throw new Error("no push step");
		push.controlValues = { subject: "{{payload.title}}", body: `Open ${appUrl}/inbox` };
		await pullDashboard(fakeDashboard({ workflows: [edited] }), appUrl, dir);

		const file = read(dir, "workflows", "test_push.workflow.ts");
		expect(file).toContain('updatedAt: "2026-03-04T05:06:07.000Z"');
		expect(file).toContain("definition: (input) => ({");
		// The file holds a template literal that reads `input.appUrl`.
		const appUrlExpression = ["$", "{input.appUrl}"].join("");
		expect(file).toContain(`body: \`Open ${appUrlExpression}/inbox\``);
		expect(file).not.toContain(appUrl);
	});

	it("skips bridge-made workflows and keeps code files the dashboard lacks", async () => {
		fs.mkdirSync(path.join(dir, "workflows"));
		fs.writeFileSync(path.join(dir, "workflows", "kept_here.workflow.ts"), "// kept\n");
		await pullDashboard(
			fakeDashboard({
				workflows: [
					asInDashboard(testPushWorkflow, appUrl),
					{
						...asInDashboard(testPushWorkflow, appUrl),
						workflowId: "old-bridge",
						origin: "external",
					},
				],
			}),
			appUrl,
			dir,
		);
		expect(filesIn(dir, "workflows").sort()).toEqual([
			"index.ts",
			"kept_here.workflow.ts",
			"test_push.workflow.ts",
		]);
		expect(read(dir, "workflows", "kept_here.workflow.ts")).toBe("// kept\n");
		const index = read(dir, "workflows", "index.ts");
		expect(index).toContain('import { keptHereWorkflow } from "./kept_here.workflow";');
		expect(index).toContain("\tkeptHereWorkflow,\n\ttestPushWorkflow,\n];");
	});
});
