import { describe, expect, it } from "vitest";
import { createAppTheme } from "./theme.config";

// jsdom applies no media queries to computed style, so the rules are read
// from the theme itself.
describe("the shared accessibility floor", () => {
	it.each(["light", "dark"] as const)("is in the %s theme", (mode) => {
		const theme = createAppTheme(mode);
		const overrides = theme.components?.MuiCssBaseline?.styleOverrides;
		expect(typeof overrides).toBe("function");
		if (typeof overrides !== "function") return;
		const rules = overrides(theme) as Record<string, unknown>;
		expect(rules[":focus-visible"]).toMatchObject({
			outline: `2px solid ${theme.palette.primary.main}`,
		});
		expect(rules["@media (prefers-reduced-motion: reduce)"]).toBeDefined();
		expect(rules["@media (pointer: coarse)"]).toMatchObject({
			"input, textarea, select": { fontSize: "16px !important" },
			".MuiIconButton-root": { minWidth: 44 },
		});
	});
});
