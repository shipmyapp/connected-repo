import { afterEach, describe, expect, it, vi } from "vitest";

const TEAM = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
	vi.doUnmock("../worker/sync/active_team");
});

describe("active team header (main thread)", () => {
	it("lets a noTeam call go out before any seed, without a team", async () => {
		vi.stubGlobal("window", {});
		const mod = await import("./active_team_header.client");
		// Resolves at once: a team host's branding lookup must not wait for a
		// session that does not exist yet ("Loading workspace…" for ever).
		await expect(mod.teamIdForCall({ noTeam: true })).resolves.toBeNull();
	});

	it("holds a team-scoped call until the cache is seeded", async () => {
		vi.stubGlobal("window", {});
		const mod = await import("./active_team_header.client");
		let settled = false;
		const waiting = mod.teamIdForCall({}).then((id) => {
			settled = true;
			return id;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		mod.setActiveTeamIdForRequests(TEAM);
		await expect(waiting).resolves.toBe(TEAM);
		await expect(mod.teamIdForCall({})).resolves.toBe(TEAM);
		// noTeam never carries a team, seeded or not.
		await expect(mod.teamIdForCall({ noTeam: true })).resolves.toBeNull();
	});
});

describe("active team header (worker)", () => {
	it("mirrors the worker's active team and answers noTeam with null", async () => {
		vi.stubGlobal("self", {});
		// A holder object, not a `let`: TypeScript would narrow a `let` assigned
		// only inside the mock factory to `null` at the call site.
		const holder: { cb: ((id: string | null) => void) | null } = { cb: null };
		vi.doMock("../worker/sync/active_team", () => ({
			getActiveTeamId: () => TEAM,
			onActiveTeamChange: (cb: (id: string | null) => void) => {
				holder.cb = cb;
				return () => {};
			},
		}));
		const mod = await import("./active_team_header.client");
		await vi.waitFor(() => expect(mod.getActiveTeamIdForRequests()).toBe(TEAM));
		await expect(mod.teamIdForCall({})).resolves.toBe(TEAM);
		await expect(mod.teamIdForCall({ noTeam: true })).resolves.toBeNull();
		holder.cb?.(null);
		expect(mod.getActiveTeamIdForRequests()).toBeNull();
	});
});
