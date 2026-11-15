import type { CodeLayout } from "@backend/novu/code_layout";
import type { CodeWorkflow } from "@backend/novu/code_workflow";

/**
 * What Novu would flag in our templates, checked before a deploy instead of
 * after it. Novu creates a workflow whose templates it cannot place and marks
 * it "Action required" (status ERROR); a layout it refuses outright. Its rules,
 * as 3.15 applies them:
 * - every `payload.*` a step reads must be declared in the workflow's
 *   `payloadSchema`, nested objects included;
 * - a name in Liquid must start from a namespace Novu knows (`payload`,
 *   `subscriber`, `steps`, `context`, `env`): Liquid's own `blank`, `empty`
 *   and `nil` read as unknown variables, so test an optional field with a
 *   plain `{% if payload.x %}` (empty values are dropped at trigger);
 * - a layout reads only `subscriber`, `content`, `context` and `env`, holds
 *   `{{content}}`, and is a whole HTML page.
 */

const STEP_ROOTS = new Set(["payload", "subscriber", "steps", "context", "env"]);
const LAYOUT_ROOTS = new Set(["subscriber", "content", "context", "env"]);
const KEYWORDS = new Set([
	"if",
	"elsif",
	"else",
	"endif",
	"unless",
	"endunless",
	"case",
	"when",
	"endcase",
	"for",
	"in",
	"endfor",
	"and",
	"or",
	"contains",
	"true",
	"false",
]);

type JsonSchema = { properties?: Record<string, JsonSchema> };

/** Each name a template reads, as written: `payload.brand.name`, `blank`. */
export const liquidNames = (template: string): string[] => {
	const names: string[] = [];
	for (const match of template.matchAll(/\{\{-?([\s\S]*?)-?\}\}|\{%-?([\s\S]*?)-?%\}/g)) {
		const code = (match[1] ?? match[2] ?? "").replace(/"[^"]*"|'[^']*'/g, " ");
		const [head = "", ...filters] = code.split("|");
		// A filter's own name is not a variable; its arguments can be.
		const parts = [head, ...filters.map((f) => f.replace(/^\s*[\w-]+\s*:?/, " "))];
		for (const part of parts) {
			for (const [name] of part.matchAll(/[A-Za-z_][\w.]*/g)) {
				if (!KEYWORDS.has(name)) names.push(name);
			}
		}
	}
	return names;
};

const asSchema = (value: unknown): JsonSchema | undefined => {
	if (typeof value !== "object" || value === null || !("properties" in value)) return undefined;
	const { properties } = value;
	if (typeof properties !== "object" || properties === null) return {};
	return {
		properties: Object.fromEntries(
			Object.entries(properties).map(([key, child]) => [key, asSchema(child) ?? {}]),
		),
	};
};

const declared = (schema: JsonSchema | undefined, path: string[]): boolean => {
	if (path.length === 0) return true;
	const [key = "", ...rest] = path;
	const next = schema?.properties?.[key];
	return next !== undefined && (rest.length === 0 || declared(next, rest));
};

const strings = (value: unknown): string[] => {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap(strings);
	if (typeof value === "object" && value !== null) return Object.values(value).flatMap(strings);
	return [];
};

export const templateProblems = (workflows: CodeWorkflow[], layouts: CodeLayout[]): string[] => {
	const appUrl = "https://app.example.com";
	const problems: string[] = [];

	for (const codeLayout of layouts) {
		const { layoutId, email } = codeLayout.definition({ appUrl });
		const body = email.body;
		for (const name of liquidNames(body)) {
			const root = name.split(".")[0] ?? name;
			if (!LAYOUT_ROOTS.has(root))
				problems.push(
					`layout ${layoutId}: "${name}" (a layout reads only subscriber, content, context, env)`,
				);
		}
		if (!/\{\{\s*content\s*\}\}/.test(body)) problems.push(`layout ${layoutId}: no {{content}}`);
		if (!["<html", "</html>", "<body", "</body>"].every((tag) => body.includes(tag))) {
			problems.push(`layout ${layoutId}: not a whole HTML page (<html>, <body>)`);
		}
	}

	for (const codeWorkflow of workflows) {
		const definition = codeWorkflow.definition({ appUrl });
		const schema = asSchema(definition.payloadSchema);
		for (const step of definition.steps) {
			for (const name of new Set(strings(step.controlValues).flatMap(liquidNames))) {
				const [root = "", ...path] = name.split(".");
				const where = `workflow ${definition.workflowId} step ${step.stepId}`;
				if (!STEP_ROOTS.has(root)) {
					problems.push(`${where}: "${name}" is not a variable Novu knows`);
				} else if (root === "payload" && !declared(schema, path)) {
					problems.push(`${where}: "${name}" is not in the payloadSchema`);
				}
			}
		}
	}
	return problems;
};
