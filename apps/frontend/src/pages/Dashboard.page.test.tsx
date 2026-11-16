// @vitest-environment jsdom
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Entries = { id: string }[];
type TestRouter = ReturnType<typeof createMemoryRouter>;

const state: { router: TestRouter | null; resolveEntries: ((entries: Entries) => void) | null } = {
	router: null,
	resolveEntries: null,
};

// The page reads the app's router for the live navigation state; here that is
// the memory router each test builds.
vi.mock("@frontend/router", () => ({
	get router() {
		return state.router;
	},
}));
vi.mock("@frontend/contexts/UserContext", () => ({
	useSessionInfo: () => ({ user: { id: "u1", name: "Ada", email: "ada@example.com" } }),
}));
vi.mock("@frontend/contexts/WorkspaceContext", () => ({
	useActiveTeamId: () => "team-1",
	useWorkspace: () => ({ activeWorkspace: { id: "team-1", name: "Ada", type: "personal" } }),
}));
vi.mock("@frontend/components/notifications/NotificationBanner", () => ({
	NotificationBanner: () => null,
}));
vi.mock("@frontend/utils/orpc.tanstack.client", () => ({
	orpc: {
		journalEntries: {
			getAll: {
				queryOptions: () => ({
					queryKey: ["journalEntries", "getAll"],
					queryFn: () =>
						new Promise<Entries>((resolve) => {
							state.resolveEntries = resolve;
						}),
				}),
			},
		},
	},
}));

const NewEntryStub = () => <p>new entry</p>;
const ProfileStub = () => <p>profile</p>;

/** A profile route whose module takes as long as the test wants: its navigation stays under way. */
const buildRouter = async () => {
	// A fresh module per test: the first-run check is once per JS runtime.
	vi.resetModules();
	const { default: DashboardPage } = await import("./Dashboard.page");
	let releaseProfile: () => void = () => {};
	const profileLoaded = new Promise<void>((resolve) => {
		releaseProfile = resolve;
	});
	const router = createMemoryRouter(
		[
			{ path: "/dashboard", Component: DashboardPage },
			{ path: "/journal-entries/new", Component: NewEntryStub },
			{
				path: "/profile",
				lazy: async () => {
					await profileLoaded;
					return { Component: ProfileStub };
				},
			},
		],
		{ initialEntries: ["/dashboard"] },
	);
	state.router = router;
	return { router, releaseProfile };
};

const renderRouter = (router: TestRouter) =>
	render(
		<QueryClientProvider
			client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
		>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);

/** Waits until the page has asked for its entries; returns the hand that answers. */
const entriesRequested = () =>
	vi.waitFor(() => {
		const resolve = state.resolveEntries;
		if (!resolve) throw new Error("entries not requested yet");
		return resolve;
	});

describe("Dashboard first-run redirect", () => {
	beforeEach(() => {
		state.router = null;
		state.resolveEntries = null;
		// Query results reach the page in the same task, as a synchronous store
		// update, instead of on a later timer.
		notifyManager.setScheduler((callback) => callback());
	});
	afterEach(() => {
		cleanup();
	});

	it("sends a person with no entries to the new-entry page", async () => {
		const { router } = await buildRouter();
		renderRouter(router);
		const resolveEntries = await entriesRequested();
		await act(async () => {
			resolveEntries([]);
		});
		expect(router.state.location.pathname).toBe("/journal-entries/new");
	});

	it("leaves a navigation the person started before the entries arrived", async () => {
		const { router, releaseProfile } = await buildRouter();
		renderRouter(router);
		const resolveEntries = await entriesRequested();
		// The click and the entries land together: the router's "loading" state
		// is still a pending transition when the entries render commits.
		await act(async () => {
			void router.navigate("/profile");
			resolveEntries([]);
		});
		expect(router.state.location.pathname).toBe("/dashboard");
		expect(router.state.navigation.state).toBe("loading");
		await act(async () => {
			releaseProfile();
		});
		await vi.waitFor(() => expect(router.state.location.pathname).toBe("/profile"));
	});
});
