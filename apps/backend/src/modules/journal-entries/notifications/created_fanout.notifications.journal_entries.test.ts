import { db } from "@backend/db/db";
import { defaultContext } from "@backend/test/setup";
import { addMember, createSharedTeam, memberIdOf } from "@backend/test/utils/team.utils";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const triggerNotification = vi.fn().mockResolvedValue(undefined);

// The test setup has already loaded the handler with the real sender: load it
// again with the sender faked, on the same database handle (the test transaction).
let handler: typeof import("./created_fanout.notifications.journal_entries.js").journalEntryCreatedFanoutHandler;
beforeAll(async () => {
	vi.resetModules();
	vi.doMock("@backend/utils/notifications.utils", () => ({ triggerNotification }));
	vi.doMock("@backend/db/db", () => ({ db }));
	handler = (await import("./created_fanout.notifications.journal_entries.js"))
		.journalEntryCreatedFanoutHandler;
});

const fanOut = (teamId: string, authorUserId: string) =>
	handler({
		input: {
			entryId: "01JTESTENTRY0000000000000",
			teamId,
			authorUserId,
			authorName: "Ada",
			contentPreview: "Hello",
		},
	});

const recipients = (): string[] =>
	triggerNotification.mock.calls.map(([call]) => call.subscriberId);

describe("journal_entry_created_fanout", () => {
	beforeEach(() => {
		triggerNotification.mockClear();
	});

	it("tells every other member of the team (team ids are ULIDs, not uuids)", async () => {
		if (!defaultContext) throw new Error("test context missing");
		const { teamId, owner } = await createSharedTeam(defaultContext);
		const first = await addMember(owner, teamId, "Member");
		const second = await addMember(owner, teamId, "Member");

		await fanOut(teamId, owner.user.id);

		expect(recipients().sort()).toEqual([first.user.id, second.user.id].sort());
		expect(recipients()).not.toContain(owner.user.id);
		for (const [call] of triggerNotification.mock.calls) {
			expect(call.workflowId).toBe("journal-entry-created");
		}
	});

	it("tells nobody when the author is the only member", async () => {
		if (!defaultContext) throw new Error("test context missing");
		const { teamId, owner } = await createSharedTeam(defaultContext);
		await fanOut(teamId, owner.user.id);
		expect(triggerNotification).not.toHaveBeenCalled();
	});

	it("skips a member who has left (soft-deleted row)", async () => {
		if (!defaultContext) throw new Error("test context missing");
		const { teamId, owner } = await createSharedTeam(defaultContext);
		const staying = await addMember(owner, teamId, "Member");
		const leaving = await addMember(owner, teamId, "Member");
		const leavingId = await memberIdOf(leaving);
		await db.teamMembers
			.unscope("default")
			.where({ id: leavingId, teamId })
			.update({ deletedAt: Date.now() });

		await fanOut(teamId, owner.user.id);

		expect(recipients()).toEqual([staying.user.id]);
	});
});
