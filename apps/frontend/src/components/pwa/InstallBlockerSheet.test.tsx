// @vitest-environment jsdom
import { renderWithTheme } from "@frontend/test/render";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallBlockerSheet } from "./InstallBlockerSheet";

const reported: string[] = [];
vi.mock("./install-record", () => ({
	reportInstallBlocker: (reason: string) => reported.push(reason),
}));
vi.mock("@frontend/tenant/TenantContext", () => ({
	useTenant: () => ({ brand: { appName: "Team Journal", iconUrl: "/team-icon.png" } }),
}));

afterEach(cleanup);

describe("InstallBlockerSheet", () => {
	beforeEach(() => {
		reported.length = 0;
	});

	it("asks what happened, keeps the answer and offers the steps again when they could not find them", () => {
		const onClose = vi.fn();
		const onShowSteps = vi.fn();
		renderWithTheme(<InstallBlockerSheet isOpen onClose={onClose} onShowSteps={onShowSteps} />);
		fireEvent.click(screen.getByRole("button", { name: "I couldn't find the buttons" }));
		expect(reported).toEqual(["couldnt_find"]);
		fireEvent.click(screen.getByRole("button", { name: "Show me the steps again" }));
		expect(onClose).toHaveBeenCalled();
		expect(onShowSteps).toHaveBeenCalled();
		// An answer given is not followed by a "skipped".
		expect(reported).toEqual(["couldnt_find"]);
	});

	it("does not offer the steps to someone who added it", () => {
		renderWithTheme(<InstallBlockerSheet isOpen onClose={vi.fn()} onShowSteps={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "I added it" }));
		expect(screen.queryByRole("button", { name: "Show me the steps again" })).toBeNull();
	});

	it("keeps a close without an answer as skipped, so it is never asked again", () => {
		const onClose = vi.fn();
		renderWithTheme(<InstallBlockerSheet isOpen onClose={onClose} onShowSteps={vi.fn()} />);
		fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0] as HTMLElement);
		expect(reported).toEqual(["skipped"]);
		expect(onClose).toHaveBeenCalled();
	});

	it("closes on the phone's Back instead of leaving the page under it", () => {
		const onClose = vi.fn();
		renderWithTheme(<InstallBlockerSheet isOpen onClose={onClose} onShowSteps={vi.fn()} />);
		act(() => {
			window.history.replaceState(null, "");
			window.dispatchEvent(new PopStateEvent("popstate"));
		});
		expect(onClose).toHaveBeenCalledOnce();
		expect(reported).toEqual(["skipped"]);
	});

	it("shows the team's own icon", () => {
		renderWithTheme(<InstallBlockerSheet isOpen onClose={vi.fn()} onShowSteps={vi.fn()} />);
		const icon = screen.getByTestId("install-blocker").querySelector("img");
		expect(icon?.getAttribute("src")).toBe("/team-icon.png");
	});
});
