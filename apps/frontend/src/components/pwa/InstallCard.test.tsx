// @vitest-environment jsdom
import { renderWithTheme } from "@frontend/test/render";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pwa = vi.hoisted(() => ({
	isInstalled: false,
	canInstall: true,
	install: async () => undefined,
}));
const here = vi.hoisted(() => ({ installedHere: undefined as boolean | undefined }));
vi.mock("@frontend/components/notifications/PwaInstallHost", () => ({
	usePwaInstallCtx: () => pwa,
}));
vi.mock("./install-record", () => ({ useInstalledHere: () => here.installedHere }));
vi.mock("@frontend/tenant/TenantContext", () => ({
	useTenant: () => ({ brand: { appName: "Team Journal", iconUrl: "/team-icon.png" } }),
}));

const { InstallCard } = await import("./InstallCard");

describe("the profile's Install card", () => {
	afterEach(() => {
		cleanup();
		here.installedHere = undefined;
		pwa.isInstalled = false;
		pwa.canInstall = true;
	});

	it("shows on a device without the app", () => {
		here.installedHere = false;
		renderWithTheme(<InstallCard />);
		expect(screen.getByTestId("install-app")).toBeTruthy();
		// The team's own app name, not the template's.
		expect(screen.getByText("Install Team Journal")).toBeTruthy();
	});

	it("hides where the install record knows the app is installed on this very device", () => {
		here.installedHere = true;
		renderWithTheme(<InstallCard />);
		expect(screen.queryByTestId("install-app")).toBeNull();
	});

	it("hides where the browser itself knows, and where nothing can be installed", () => {
		pwa.isInstalled = true;
		renderWithTheme(<InstallCard />);
		expect(screen.queryByTestId("install-app")).toBeNull();
		cleanup();
		pwa.isInstalled = false;
		pwa.canInstall = false;
		renderWithTheme(<InstallCard />);
		expect(screen.queryByTestId("install-app")).toBeNull();
	});
});
