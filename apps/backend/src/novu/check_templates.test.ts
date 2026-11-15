import { liquidNames, templateProblems } from "@backend/novu/check_templates";
import { novuLayouts } from "@backend/novu/layouts";
import { novuWorkflows } from "@backend/novu/workflows";
import { describe, expect, it } from "vitest";

describe("Novu templates", () => {
	it("pass the checks Novu applies when the boot uploads them", () => {
		expect(templateProblems(novuWorkflows, novuLayouts)).toEqual([]);
	});

	it("reads names, not filters or string literals", () => {
		expect(
			liquidNames(`{% if payload.x != blank %}{{payload.y | default: 'a.b' | escape}}{% endif %}`),
		).toEqual(["payload.x", "blank", "payload.y"]);
	});
});
