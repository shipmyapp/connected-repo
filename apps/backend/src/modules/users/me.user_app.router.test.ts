import { meRouter } from "@backend/modules/users/me.user_app.router";
import { defaultContext } from "@backend/test/setup";
import { teamsClient } from "@backend/test/utils/team.utils";
import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

describe("me.profile", () => {
	// A session-level procedure: no team request context, so it must lift the
	// team_members tenant scope itself and name the caller.
	it("lists every team the caller belongs to, outside a team request", async () => {
		if (!defaultContext) throw new Error("test context missing");
		const shared = await teamsClient(defaultContext).createTeam({ name: "Shared" });
		const profile = await createRouterClient(meRouter, { context: defaultContext }).profile();
		expect(profile.id).toBe(defaultContext.user.id);
		expect(profile.teams.map((t) => t.id).sort()).toEqual(
			[defaultContext.user.activeTeamAppId, shared.id].sort(),
		);
	});
});
