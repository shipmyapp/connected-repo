import type { CodeLayout } from "@backend/novu/code_layout";
import type { CodeWorkflow } from "@backend/novu/code_workflow";
import {
	type DashboardReader,
	definitionOf,
	layoutDefinitionOf,
	readDashboardLayouts,
	readDashboardWorkflows,
} from "@backend/novu/dashboard_snapshot";

/**
 * How one Novu environment's workflows and email layouts stand against the
 * code (`yarn novu:status`): which were edited in the dashboard (by whom,
 * when, and what changed), which the code would overwrite at the next boot,
 * and which exist on one side only. Reads only; writes nothing.
 */

/** Values Novu fills in on its own; a side without them is no different. */
const isDefault = (key: string, value: unknown) =>
	value === undefined ||
	value === null ||
	key === "source" ||
	(key === "disableOutputSanitization" && value === false) ||
	(key === "isTranslationEnabled" && value === false) ||
	(key === "severity" && value === "none");

/** Leaf paths → values; steps keyed by stepId so reordering reads as such. */
const flatten = (value: unknown, prefix: string, out: Map<string, string>) => {
	if (Array.isArray(value)) {
		value.forEach((v, i) => {
			const stepId =
				v !== null && typeof v === "object" && "stepId" in v && typeof v.stepId === "string"
					? v.stepId
					: String(i);
			flatten(v, `${prefix}[${stepId}]`, out);
		});
		if (value.length === 0) out.set(prefix, "[]");
		return;
	}
	if (value !== null && typeof value === "object") {
		for (const [k, v] of Object.entries(value)) {
			if (!isDefault(k, v)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
		}
		return;
	}
	out.set(prefix, typeof value === "string" ? value : JSON.stringify(value));
};

const short = (text: string) => {
	const one = text.replace(/\s+/g, " ").trim();
	return JSON.stringify(one.length > 90 ? `${one.slice(0, 87)}...` : one);
};

/** A template line as a reader sees it: its text without the tags, else the line. */
const visible = (line: string) =>
	line
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim() || line;

/** What changed at one path, readably: multi-line text by lines. */
const describe = (path: string, code: string | undefined, dash: string | undefined) => {
	if (code === undefined) return `    + ${path}: ${short(dash ?? "")} (only in the dashboard)`;
	if (dash === undefined) return `    - ${path}: ${short(code)} (only in code)`;
	if (!code.includes("\n") && !dash.includes("\n")) {
		return `    ~ ${path}: ${short(code)} → ${short(dash)}`;
	}
	const codeLines = new Set(code.split("\n").map((l) => l.trim()));
	const dashLines = new Set(dash.split("\n").map((l) => l.trim()));
	const added = [...dashLines].filter((l) => l && !codeLines.has(l));
	const removed = [...codeLines].filter((l) => l && !dashLines.has(l));
	return [
		`    ~ ${path}: ${added.length} line(s) new in the dashboard, ${removed.length} gone`,
		...added.slice(0, 5).map((l) => `        + ${short(visible(l))}`),
		...removed.slice(0, 5).map((l) => `        - ${short(visible(l))}`),
	].join("\n");
};

type Side = {
	updatedAt: string;
	updatedBy?: { firstName?: string | null; lastName?: string | null } | null;
	/** `external`: the old bridge's (workflows only). */
	origin?: string;
	definition: unknown;
};

const who = (side: Side) => {
	const name = [side.updatedBy?.firstName, side.updatedBy?.lastName].filter(Boolean).join(" ");
	return name ? ` by ${name}` : "";
};

/** One line per id (and the changed fields under it); whether anything differs. */
const compare = (noun: string, dashboard: Map<string, Side>, code: Map<string, Side>) => {
	const lines: string[] = [];
	let differs = false;
	for (const id of [...new Set([...dashboard.keys(), ...code.keys()])].sort()) {
		const dash = dashboard.get(id);
		const mine = code.get(id);
		const label = `${noun} ${id}`;
		if (!mine) {
			differs = true;
			lines.push(
				`${label}: only in the dashboard (created${dash ? who(dash) : ""}); \`yarn novu:pull\` adds it to code`,
			);
			continue;
		}
		if (!dash) {
			differs = true;
			lines.push(`${label}: only in code; the next boot creates it in Novu`);
			continue;
		}
		if (dash.origin === "external") {
			differs = true;
			lines.push(`${label}: defined by the old bridge; the next boot replaces it from code`);
			continue;
		}
		const a = new Map<string, string>();
		const b = new Map<string, string>();
		flatten(mine.definition, "", a);
		flatten(dash.definition, "", b);
		const changed = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
		if (changed.length === 0) {
			lines.push(`${label}: in sync`);
			continue;
		}
		differs = true;
		const dashAt = new Date(dash.updatedAt).toISOString();
		const codeAt = new Date(mine.updatedAt).toISOString();
		lines.push(
			dashAt > codeAt
				? `${label}: EDITED IN THE DASHBOARD${who(dash)} at ${dashAt} (code: ${codeAt}). Boot leaves it; \`yarn novu:pull\` brings it into code.`
				: `${label}: CODE IS NEWER (${codeAt}; dashboard ${dashAt}${who(dash)}). The next boot overwrites the dashboard with the code.`,
			...changed.sort().map((k) => describe(k, a.get(k), b.get(k))),
		);
	}
	return { lines, differs };
};

/** The report for one environment: its lines, and whether anything differs. */
export const dashboardStatus = async (
	novu: DashboardReader,
	appUrl: string,
	code: { workflows: CodeWorkflow[]; layouts: CodeLayout[] },
): Promise<{ lines: string[]; differs: boolean }> => {
	const layouts = compare(
		"layout",
		new Map(
			(await readDashboardLayouts(novu)).map((x) => [
				x.layoutId,
				{ updatedAt: x.updatedAt, updatedBy: x.updatedBy, definition: layoutDefinitionOf(x) },
			]),
		),
		new Map(
			code.layouts.map((cl) => {
				const definition = cl.definition({ appUrl });
				return [definition.layoutId, { updatedAt: cl.updatedAt, definition }];
			}),
		),
	);
	const workflows = compare(
		"workflow",
		new Map(
			(await readDashboardWorkflows(novu)).map((x) => [
				x.workflowId,
				{
					updatedAt: x.updatedAt,
					updatedBy: x.updatedBy,
					origin: x.origin,
					definition: definitionOf(x),
				},
			]),
		),
		new Map(
			code.workflows.map((cw) => {
				const definition = cw.definition({ appUrl });
				return [definition.workflowId, { updatedAt: cw.updatedAt, definition }];
			}),
		),
	);
	return {
		lines: [...layouts.lines, ...workflows.lines],
		differs: layouts.differs || workflows.differs,
	};
};
