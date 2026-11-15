// @vitest-environment jsdom
import { renderWithTheme } from "@frontend/test/render";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consentFetch = vi.hoisted(() => vi.fn());
const describeApp = vi.hoisted(() => vi.fn());

vi.mock("@frontend/utils/auth.client", () => ({ authClient: { $fetch: consentFetch } }));
vi.mock("@frontend/utils/orpc.tanstack.client", () => ({
	orpc: {
		connectedApps: {
			describe: {
				queryOptions: ({ input }: { input: unknown }) => ({
					queryKey: ["connectedApps", "describe", input],
					queryFn: () => describeApp(input),
				}),
			},
		},
	},
}));
vi.mock("@frontend/tenant/TenantContext", () => ({
	useTenant: () => ({ brand: { appName: "Team Journal" } }),
}));

const { default: OAuthConsentPage } = await import("./OAuthConsent.page");

const REDIRECT = "https://claude.ai/cb";
const query = (redirectUri = REDIRECT) =>
	`?${new URLSearchParams({
		client_id: "c",
		redirect_uri: redirectUri,
		scope: "read write offline_access",
		exp: "9999999999",
		sig: "s",
	})}`;

const assign = vi.fn();

const open = (search = query()) => {
	vi.stubGlobal("location", { ...window.location, assign, search });
	renderWithTheme(
		<MemoryRouter initialEntries={[`/oauth/consent${search}`]}>
			<OAuthConsentPage />
		</MemoryRouter>,
	);
};

describe("the consent screen", () => {
	beforeEach(() => {
		describeApp.mockResolvedValue({
			clientId: "c",
			platform: "Claude",
			isKnownPlatform: true,
			name: "Claude",
			host: "claude.ai",
			uri: null,
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		assign.mockReset();
		consentFetch.mockReset();
		describeApp.mockReset();
	});

	it("names the platform and the app, and goes back to the app's own redirect URI", async () => {
		consentFetch.mockResolvedValueOnce({ data: { url: `${REDIRECT}?code=x&state=y` } });
		open();
		expect(await screen.findByText("Connect Claude to your Team Journal account?")).toBeTruthy();
		fireEvent.click(screen.getByText("Connect"));
		await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(`${REDIRECT}?code=x&state=y`));
		expect(consentFetch.mock.lastCall?.[1]).toMatchObject({
			method: "POST",
			body: { accept: true, scope: "read write offline_access" },
		});
	});

	it("never navigates to a URL off the request's redirect URI, on Connect or on Cancel", async () => {
		for (const [button, url] of [
			["Connect", "javascript:alert(1)"],
			["Connect", "https://evil.example/cb?code=x"],
			["Cancel", "https://claude.ai/elsewhere?error=access_denied"],
		] as const) {
			consentFetch.mockResolvedValueOnce({ data: { url } });
			open();
			fireEvent.click(await screen.findByText(button));
			expect(await screen.findByRole("alert")).toHaveProperty(
				"textContent",
				"That did not work. Go back to the app and try connecting again.",
			);
			expect(assign).not.toHaveBeenCalled();
			cleanup();
		}
	});

	it("turns write off when the person says so", async () => {
		consentFetch.mockResolvedValueOnce({ data: { url: `${REDIRECT}?code=x` } });
		open();
		fireEvent.click(await screen.findByLabelText(/Add journal entries/));
		fireEvent.click(screen.getByText("Connect"));
		await vi.waitFor(() => expect(assign).toHaveBeenCalled());
		expect(consentFetch.mock.lastCall?.[1]).toMatchObject({
			body: { accept: true, scope: "read offline_access" },
		});
	});

	it("refuses a request whose redirect URI is not https or loopback, without asking the server", async () => {
		open(query("javascript:alert(1)//"));
		expect(
			await screen.findByText(
				"This request is not valid any more. Go back to the app and try connecting again.",
			),
		).toBeTruthy();
		expect(screen.queryByText("Connect")).toBeNull();
		expect(describeApp).not.toHaveBeenCalled();
	});
});
