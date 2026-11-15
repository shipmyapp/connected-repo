import { db } from "@backend/db/db";
import { requestContext } from "@backend/lib/request-context";
import { defaultContext } from "@backend/test/setup";
import { describe, expect, it } from "vitest";

describe("tenant scopes fail closed", () => {
	it.each([
		["team_members", () => db.teamMembers.take()],
		["journal_entries", () => db.journalEntries.takeOptional()],
		["files", () => db.files.takeOptional()],
	])("%s refuses a query with no team request context", async (table, query) => {
		// pqb builds the SQL (and runs the scope) when the query is awaited.
		const run = async () => {
			await query();
		};
		await expect(run()).rejects.toThrow(new RegExp(`${table} queried outside a team request`));
	});

	it("filters to the request's team inside a context, and unscope lifts it", async () => {
		if (!defaultContext) throw new Error("test context missing");
		const teamId = defaultContext.user.activeTeamAppId as string;
		const own = await db.teamMembers
			.unscope("default")
			.where({ teamId, userId: defaultContext.user.id })
			.take();
		const rows = await requestContext.run(
			{
				tenantTeamId: teamId,
				userId: defaultContext.user.id,
				teamMemberId: own.id,
				teamMemberRole: own.role,
			},
			// Awaited inside the context: the scope reads it when the SQL is built.
			async () => await db.teamMembers.select("teamId"),
		);
		expect(rows.every((r) => r.teamId === teamId)).toBe(true);
		await expect(db.teamMembers.unscope("default").take()).resolves.toBeDefined();
	});
});
