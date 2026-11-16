import { afterAll } from "vitest";

// jsdom has no matchMedia; the primitives read it for breakpoints and
// reduced motion. Only defined where a window exists (node tests skip it).
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
	window.matchMedia = (query: string): MediaQueryList => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	});
}

// A component test can leave timers behind (a sheet's history settle after it
// closes, MUI's transitions). When they fire after the file's last test, the
// jsdom window is already gone and the run reports "window is not defined".
// Let them run out while the window still exists.
if (typeof window !== "undefined") {
	afterAll(() => new Promise<void>((resolve) => setTimeout(resolve, 400)));
}
