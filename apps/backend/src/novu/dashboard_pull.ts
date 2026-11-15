import fs from "node:fs";
import path from "node:path";
import {
	type DashboardReader,
	definitionOf,
	layoutDefinitionOf,
	readDashboardLayouts,
	readDashboardWorkflows,
} from "@backend/novu/dashboard_snapshot";

/**
 * Writing a Novu environment's workflows and email layouts into code
 * (`yarn novu:pull`): one `<id>.workflow.ts` / `<id>.layout.ts` per item with
 * `updatedAt` set to the dashboard's, and both indexes rewritten, so that at
 * boot ensureNovuWorkflows finds the two equal and leaves Novu alone. The
 * app's origin is written back as `${input.appUrl}`, so each environment
 * links to its own host.
 */

const APP_URL_EXPR = ["$", "{input.appUrl}"].join("");

/** One kind of thing pulled: where its files live and how they are named. */
type Kind = {
	noun: "workflow" | "layout";
	dir: string;
	/** `CodeWorkflow` / `CodeLayout`, from `@backend/novu/code_<noun>`. */
	type: string;
	/** `novuWorkflows` / `novuLayouts`. */
	indexExport: string;
};
const WORKFLOWS: Kind = {
	noun: "workflow",
	dir: "workflows",
	type: "CodeWorkflow",
	indexExport: "novuWorkflows",
};
const LAYOUTS: Kind = {
	noun: "layout",
	dir: "layouts",
	type: "CodeLayout",
	indexExport: "novuLayouts",
};

const header = (kind: Kind) =>
	`// Kept in step with the Novu dashboard (newer updatedAt wins at boot). Before editing this ${kind.noun}, run \`yarn novu:status\` (skill novu-pull); a hand edit sets updatedAt to now.`;

/** `user-created` and `user_created` → `userCreatedWorkflow` (or `…Layout`). */
const exportName = (idOrStem: string, kind: Kind) =>
	`${idOrStem.replace(/[^a-zA-Z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ""))}${kind.noun === "workflow" ? "Workflow" : "Layout"}`;
const fileStem = (id: string) => id.replace(/[^a-zA-Z0-9]+/g, "_");

/**
 * A TypeScript literal for a JSON value, tab-indented (Biome does not format
 * this folder). Strings that span lines or name the app's origin become
 * template literals, the origin as `${input.appUrl}`, so HTML diffs read
 * line by line.
 */
const literal = (value: unknown, appUrl: string, depth: number): string => {
	const pad = "\t".repeat(depth + 1);
	const end = "\t".repeat(depth);
	if (typeof value === "string") {
		if (!value.includes("\n") && !value.includes(appUrl)) return JSON.stringify(value);
		const escaped = value.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
		return `\`${escaped.replaceAll(appUrl, APP_URL_EXPR)}\``;
	}
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		return `[\n${value.map((v) => `${pad}${literal(v, appUrl, depth + 1)},`).join("\n")}\n${end}]`;
	}
	const entries = Object.entries(value).filter(([, v]) => v !== undefined);
	if (entries.length === 0) return "{}";
	const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
	return `{\n${entries.map(([k, v]) => `${pad}${key(k)}: ${literal(v, appUrl, depth + 1)},`).join("\n")}\n${end}}`;
};

const fileFor = (
	kind: Kind,
	id: string,
	updatedAt: string,
	definition: unknown,
	appUrl: string,
) => {
	const body = literal(definition, appUrl, 1);
	const param = body.includes(APP_URL_EXPR) ? "(input)" : "()";
	return `${header(kind)}
import type { ${kind.type} } from "@backend/novu/code_${kind.noun}";

export const ${exportName(id, kind)}: ${kind.type} = {
	updatedAt: ${JSON.stringify(new Date(updatedAt).toISOString())},
	definition: ${param} => (${body}),
};
`;
};

/**
 * Writes one file per pulled item and the kind's index. A file whose item
 * is no longer in Novu stays (the code may still use it, and the next boot
 * creates it again); a person decides.
 */
const writeKind = (
	novuDir: string,
	kind: Kind,
	items: { id: string; updatedAt: string; definition: unknown }[],
	appUrl: string,
) => {
	const dir = path.join(novuDir, kind.dir);
	fs.mkdirSync(dir, { recursive: true });
	const stems = new Set<string>();
	for (const item of items) {
		const stem = fileStem(item.id);
		fs.writeFileSync(
			path.join(dir, `${stem}.${kind.noun}.ts`),
			fileFor(kind, item.id, item.updatedAt, item.definition, appUrl),
		);
		stems.add(stem);
		console.info(`pulled ${kind.noun} ${item.id} (updated ${item.updatedAt})`);
	}
	const suffix = `.${kind.noun}.ts`;
	for (const file of fs.readdirSync(dir)) {
		if (!file.endsWith(suffix)) continue;
		const stem = file.slice(0, -suffix.length);
		if (stems.has(stem)) continue;
		console.warn(`not in Novu: ${kind.dir}/${file} (kept; delete it if it is gone for good)`);
		stems.add(stem);
	}
	const all = [...stems].sort();
	fs.writeFileSync(
		path.join(dir, "index.ts"),
		`${header(kind)}
import type { ${kind.type} } from "@backend/novu/code_${kind.noun}";
${all.map((stem) => `import { ${exportName(stem, kind)} } from "./${stem}.${kind.noun}";`).join("\n")}

// Every ${kind.noun === "workflow" ? "workflow" : "email layout"} ensureNovuWorkflows keeps in a Novu environment.
export const ${kind.indexExport}: ${kind.type}[] = [
${all.map((stem) => `\t${exportName(stem, kind)},`).join("\n")}
];
`,
	);
	return { pulled: items.length, inCode: all.length };
};

/**
 * Writes every workflow and email layout of one Novu environment into
 * `<novuDir>/workflows` and `<novuDir>/layouts`, with the dashboard's
 * `updatedAt`, and rewrites both indexes. Bridge-made workflows are skipped.
 */
export const pullDashboard = async (
	novu: DashboardReader,
	appUrl: string,
	novuDir: string,
): Promise<{
	workflows: { pulled: number; inCode: number };
	layouts: { pulled: number; inCode: number };
}> => {
	const workflows = (await readDashboardWorkflows(novu)).filter((wf) => {
		if (wf.origin !== "external") return true;
		console.warn(`skip workflow ${wf.workflowId}: defined by a bridge, not the dashboard`);
		return false;
	});
	const layouts = await readDashboardLayouts(novu);

	const l = writeKind(
		novuDir,
		LAYOUTS,
		layouts.map((x) => ({
			id: x.layoutId,
			updatedAt: x.updatedAt,
			definition: layoutDefinitionOf(x),
		})),
		appUrl,
	);
	const w = writeKind(
		novuDir,
		WORKFLOWS,
		workflows.map((x) => ({
			id: x.workflowId,
			updatedAt: x.updatedAt,
			definition: definitionOf(x),
		})),
		appUrl,
	);

	return { workflows: w, layouts: l };
};
