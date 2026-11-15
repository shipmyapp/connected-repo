import { db } from "@backend/db/db";
import { filesRouter } from "@backend/modules/files/files.router";
import { journalEntriesRouter } from "@backend/modules/journal-entries/journal-entries.router";
import { defaultContext } from "@backend/test/setup";
import { addMember, createSharedTeam, teamsClient } from "@backend/test/utils/team.utils";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { generatePublicUrl } from "@backend/utils/cdn.utils";
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

describe("files.pushCdnUpdates", () => {
	const ownerWithFile = async () => {
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
		return {
			teamId,
			owner,
			mate,
			fileId,
			client: createRouterClient(filesRouter, { context: owner }),
		};
	};

	it("accepts only a URL under the row creator's own folder", async () => {
		const { teamId, owner, mate, fileId, client } = await ownerWithFile();

		const foreign = generatePublicUrl(`${teamId}/${mate.user.id}/media/${fileId}_a.png`);
		const refused = await client.pushCdnUpdates({ updates: [{ id: fileId, cdnUrl: foreign }] });
		expect(refused.results[0]?.ok).toBe(false);

		const stepsOut = generatePublicUrl(
			`${teamId}/${owner.user.id}/../${mate.user.id}/media/${fileId}_a.png`,
		);
		const alsoRefused = await client.pushCdnUpdates({
			updates: [{ id: fileId, cdnUrl: stepsOut }],
		});
		expect(alsoRefused.results[0]?.ok).toBe(false);

		const otherRow = generatePublicUrl(`${teamId}/${owner.user.id}/media/${ulid()}_a.png`);
		const wrongId = await client.pushCdnUpdates({ updates: [{ id: fileId, cdnUrl: otherRow }] });
		expect(wrongId.results[0]?.ok).toBe(false);

		const own = generatePublicUrl(`${teamId}/${owner.user.id}/media/${fileId}_a.png`);
		const accepted = await client.pushCdnUpdates({ updates: [{ id: fileId, cdnUrl: own }] });
		expect(accepted.results[0]?.ok).toBe(true);
	});

	it("still accepts the team-only key form a row was uploaded under before", async () => {
		const { teamId, fileId, client } = await ownerWithFile();
		const legacy = generatePublicUrl(`${teamId}/media/${fileId}_a.png`);
		const accepted = await client.pushCdnUpdates({ updates: [{ id: fileId, cdnUrl: legacy }] });
		expect(accepted.results[0]?.ok).toBe(true);
	});
});
