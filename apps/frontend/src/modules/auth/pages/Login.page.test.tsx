// @vitest-environment jsdom
import { renderWithTheme } from "@frontend/test/render";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const signInSocial = vi.hoisted(() => vi.fn());
const captureException = vi.hoisted(() => vi.fn());
const fixture = vi.hoisted(() => ({ loaded: false }));
const tenant = vi.hoisted(() => ({ isTenant: false }));

vi.mock("@frontend/configs/env.config", () => ({
	env: { VITE_USER_APP_URL: "https://app.example.test", VITE_TEST_PASSWORD: undefined },
	isTest: false,
	isDev: false,
}));
vi.mock("@frontend/utils/auth.client", () => ({
	authClient: { signIn: { social: signInSocial } },
}));
vi.mock("@frontend/utils/auth.persistence", () => ({ getLastLogin: () => null }));
vi.mock("@frontend/tenant/TenantContext", () => ({
	useTenant: () => ({
		isTenant: tenant.isTenant,
		brand: {
			appName: "Acme",
			tagline: "Acme's journal",
			themeColor: "#123456",
			logoUrl: null,
		},
	}),
}));
vi.mock("@frontend/components/AppVersionLabel", () => ({ AppVersionLabel: () => null }));
vi.mock("@sentry/react", () => ({ captureException, captureMessage: vi.fn() }));
vi.mock("@connected-repo/zod-schemas/user.fixture", () => {
	fixture.loaded = true;
	return { userCreateFixture: vi.fn() };
});

const { LoginPage } = await import("./Login.page");

describe("LoginPage", () => {
	afterEach(() => {
		cleanup();
		tenant.isTenant = false;
	});

	it("says so when Google sign-in cannot start, and reports it", async () => {
		signInSocial.mockRejectedValueOnce(
			Object.assign(new Error("Provider not found"), { status: 404 }),
		);
		renderWithTheme(
			<MemoryRouter initialEntries={["/auth/login"]}>
				<LoginPage />
			</MemoryRouter>,
		);
		fireEvent.click(screen.getByText("Continue with Google"));
		expect(await screen.findByRole("alert")).toHaveProperty(
			"textContent",
			"Google sign-in isn't available right now. Try again in a minute.",
		);
		expect(captureException).toHaveBeenCalledOnce();
	});

	it("signs a team host in to itself, never to the shared app", async () => {
		tenant.isTenant = true;
		signInSocial.mockResolvedValueOnce({});
		renderWithTheme(
			<MemoryRouter initialEntries={["/auth/login"]}>
				<LoginPage />
			</MemoryRouter>,
		);
		expect(screen.getByText("Acme")).toBeDefined();
		fireEvent.click(screen.getByText("Continue with Google"));
		await vi.waitFor(() => expect(signInSocial).toHaveBeenCalled());
		expect(signInSocial.mock.lastCall?.[0]).toMatchObject({
			callbackURL: `${window.location.origin}/dashboard`,
			errorCallbackURL: `${window.location.origin}/auth/error`,
		});
	});

	it("never loads the test fixture outside test mode", () => {
		expect(fixture.loaded).toBe(false);
	});
});
