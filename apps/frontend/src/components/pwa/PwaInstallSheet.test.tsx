// @vitest-environment jsdom
import { renderWithTheme } from "@frontend/test/render";
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pwa = vi.hoisted(() => ({
	guide: "ANDROID_MENU" as const,
	isGuideOpen: true,
	isStandalone: false,
	isInstalled: false,
	isInstalling: false,
	canInstall: true,
	closeGuide: () => undefined,
	install: async () => undefined,
}));
vi.mock("@frontend/components/notifications/PwaInstallHost", () => ({
	usePwaInstallCtx: () => pwa,
}));
vi.mock("@frontend/tenant/TenantContext", () => ({
	useTenant: () => ({ brand: { appName: "Team Journal", iconUrl: "/team-icon.png" } }),
}));
vi.mock("./install-record", () => ({
	markInstallOfferShown: () => undefined,
	mayAskInstallBlocker: async () => false,
	mayOfferInstallNow: async () => false,
	reportInstallTry: () => undefined,
}));

const { PwaInstallSheet } = await import("./PwaInstallSheet");

describe("the install sheet", () => {
	afterEach(cleanup);

	it("names the team's own app and shows its icon", () => {
		renderWithTheme(<PwaInstallSheet />);
		expect(screen.getByText("Install Team Journal")).toBeTruthy();
		const icon = screen.getByTestId("install-sheet").querySelector("img[src='/team-icon.png']");
		expect(icon).not.toBeNull();
	});

	it("closes on the phone's Back instead of leaving the page under it", () => {
		const closeGuide = vi.spyOn(pwa, "closeGuide");
		renderWithTheme(<PwaInstallSheet />);
		act(() => {
			window.history.replaceState(null, "");
			window.dispatchEvent(new PopStateEvent("popstate"));
		});
		expect(closeGuide).toHaveBeenCalledOnce();
	});
});
