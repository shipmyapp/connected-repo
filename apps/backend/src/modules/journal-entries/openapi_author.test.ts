import { db } from "@backend/db/db";
import { resolveApiWriter } from "@backend/modules/journal-entries/services/openapi_author.journal_entries.service";
import { defaultContext } from "@backend/test/setup";
import { openapiJournalEntryCreateInputZod } from "@connected-repo/zod-schemas/journal_entry.zod";
import { ulid } from "ulid";
import { describe, expect, it } from "vitest";

const createKey = (writesAsTeamMemberId: string | null) =>
	db.teamsApi.create({
		name: "test key",
		apiSecretHash: "not-a-real-hash",
		allowedDomains: [],
		allowedIPs: [],
		rateLimitPerMinute: 0,
		writesAsTeamMemberId,
	});

describe("OpenAPI journal author", () => {
	it("refuses a key with no writer", async () => {
		const key = await createKey(null);
		await expect(resolveApiWriter(key.teamApiId)).rejects.toMatchObject({ status: 403 });
	});

	it("writes as the configured member, in that member's team", async () => {
		if (!defaultContext) throw new Error("test context missing");
		const teamId = defaultContext.user.activeTeamAppId as string;
		const member = await db.teamMembers
			.unscope("default")
			.where({ teamId, userId: defaultContext.user.id })
			.take();
		const key = await createKey(member.id);
		await expect(resolveApiWriter(key.teamApiId)).resolves.toMatchObject({
			tenantTeamId: teamId,
			userId: defaultContext.user.id,
			teamMemberId: member.id,
		});
	});

	it("no longer accepts a caller-chosen author", () => {
		const parsed = openapiJournalEntryCreateInputZod.parse({
			teamUserReferenceId: "ref-1",
			apiProductSku: "journal_entry_create",
			data: { id: ulid(), content: "x", authorUserId: "00000000-0000-4000-8000-000000000000" },
		});
		expect("authorUserId" in parsed.data).toBe(false);
	});
});
