import { afterEach, describe, expect, it, vi } from "vitest";
import { isHttpUrl, openExternalUrl } from "./safe_url.utils";

describe("safe_url.utils", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("accepts only absolute http(s) URLs", () => {
		expect(isHttpUrl("https://cdn.example.com/a.png")).toBe(true);
		expect(isHttpUrl("http://localhost:9000/a.png")).toBe(true);
		for (const bad of [
			"javascript:alert(1)//",
			"data:text/html,x",
			"/relative",
			"blob:https://x/1",
		]) {
			expect(isHttpUrl(bad)).toBe(false);
		}
	});

	it("opens without opener, and never a script URL", () => {
		const open = vi.fn();
		vi.stubGlobal("window", { open });
		openExternalUrl("javascript:alert(1)//");
		expect(open).not.toHaveBeenCalled();
		openExternalUrl("https://cdn.example.com/a.png");
		expect(open).toHaveBeenCalledWith(
			"https://cdn.example.com/a.png",
			"_blank",
			"noopener,noreferrer",
		);
	});
});
