import { db } from "@backend/db/db";
import { filesRouter } from "@backend/modules/files/files.router";
import { journalEntriesRouter } from "@backend/modules/journal-entries/journal-entries.router";
import { defaultContext } from "@backend/test/setup";
import { addMember, createSharedTeam, teamsClient } from "@backend/test/utils/team.utils";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { createRouterClient } from "@orpc/server";
import { ulid } from "ulid";
import { describe, expect, it } from "vitest";

const fileInput = (id: string, tableId: string) => ({
	id,
	tableName: "journalEntries" as const,
	tableId,
	type: "attachment" as const,
	fileName: "a.png",
	mimeType: "image/png",
});

describe("files.create", () => {
	it("cannot rewrite or read a teammate's file", async () => {
		if (!defaultContext) throw new Error("test context missing");
		const { teamId, owner } = await createSharedTeam(defaultContext);
		const mate = await addMember(owner, teamId, "Member");
		const entryId = ulid();
		const fileId = ulid();
		await createRouterClient(journalEntriesRouter, { context: owner }).create({
			id: entryId,
			content: "with a file",
			files: [{ ...fileInput(fileId, entryId), cdnUrl: null }],
		});

		await expect(
			createRouterClient(filesRouter, { context: mate }).create(fileInput(fileId, entryId)),
		).rejects.toMatchObject({ status: 409 });
		const row = await db.files.unscope("default").find(fileId);
		expect(row.createdByUserId).toBe(owner.user.id);
	});

	it("cannot touch another team's file", async () => {
		if (!defaultContext) throw new Error("test context missing");
		const entryId = ulid();
		const fileId = ulid();
		await createRouterClient(journalEntriesRouter, { context: defaultContext }).create({
			id: entryId,
			content: "mine",
			files: [{ ...fileInput(fileId, entryId), cdnUrl: null }],
		});
		const stranger = await createUserAndLogin();
		await expect(
			createRouterClient(filesRouter, { context: stranger }).create(fileInput(fileId, entryId)),
		).rejects.toMatchObject({ status: 409 });
	});

	it("takes no URL", async () => {
		if (!defaultContext) throw new Error("test context missing");
		const client = createRouterClient(filesRouter, { context: defaultContext });
		for (const cdnUrl of ["javascript:alert(1)//", "https://evil.example/x.png"]) {
			await expect(
				// @ts-expect-error the input type allows only null
				client.create({ ...fileInput(ulid(), ulid()), cdnUrl }),
				// Raw validation refusal (the HTTP error parser answers it as 422).
			).rejects.toMatchObject({ status: 400, message: "Input validation failed" });
		}
	});
});

describe("teams.createTeam logoUrl", () => {
	it("refuses a logo that is not on the app's storage", async () => {
		if (!defaultContext) throw new Error("test context missing");
		await expect(
			teamsClient(defaultContext).createTeam({ name: "T", logoUrl: "https://evil.example/l.png" }),
		).rejects.toMatchObject({ status: 400 });
	});
});
