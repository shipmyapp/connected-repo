import { expect, test } from "../../../e2e/fixtures";

/**
 * Regression coverage for two hard-to-unit-test bug classes that live
 * in the sync pipeline.
 *
 *  - `authLoader` cookieCache fallback: `getDefaultTeam` heals a
 *    session whose `activeTeamAppId` came back null from better-auth.
 *    The workspace chip resolving to a real team name (not "Loading…")
 *    is the observable proof that the fallback ran.
 *
 *  - `filesDb.bulkUpsertFromServer` null-guard: a pull cycle running
 *    between "thumbnail uploaded to CDN" and "thumbnail URL pushed to
 *    server" used to clobber the local `thumbnailCdnUrl`, permanently
 *    stranding the row with state=`uploaded` and url=`null`. Verified
 *    here by driving Dexie directly through the test hook exposed on
 *    `window.__testHooks` — no real CDN upload required, so the check
 *    runs in any test env regardless of S3 credential validity.
 */

test.describe("Sync pipeline regressions", () => {
	test("workspace chip resolves to a team name after login", async ({ page }) => {
		await page.goto("/dashboard");
		await page.waitForLoadState("networkidle");

		// The workspace chip lives in the app header. It falls back to
		// "Loading…" when either `sessionInfo.user.activeTeamAppId` is
		// null OR `teams.getMyTeams` hasn't returned. If the authLoader
		// fallback regressed, the null case would stick and this stays
		// "Loading…" indefinitely — assertion fails with a clear signal.
		await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15000 });
	});

	test("bulkUpsertFromServer preserves local CDN URLs when server row has nulls", async ({
		page,
	}) => {
		// Boot the app so the DataWorker is spawned and `sync.initForUser`
		// has opened the per-user Dexie DB. The test hook (exposed via
		// `main.tsx` when isTest) resolves once the worker.proxy module
		// has loaded.
		await page.goto("/journal-entries");
		await page.waitForLoadState("networkidle");
		await page.waitForFunction(
			// biome-ignore lint/suspicious/noExplicitAny: test-only bridge
			() => (window as any).__testHooks?.getDataProxy != null,
			null,
			{ timeout: 10_000 },
		);

		const result = await page.evaluate(async () => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only bridge
			const proxy = await (window as any).__testHooks.getDataProxy();
			await proxy.sync.waitForReady();

			// Synthetic 26-char ULIDs (Crockford Base32) that sort to the
			// end so the test never collides with any real rows.
			const fileId = "01HZZZZZZZAATESTATTACHMENT";
			const parentId = "01HZZZZZZZAATESTPARENTENTR";
			const baseRow = {
				id: fileId,
				tableName: "journalEntries",
				tableId: parentId,
				type: "attachment",
				fileName: "attachment-regression.png",
				mimeType: "image/png",
				createdByUserId: "00000000-0000-0000-0000-000000000000",
				deletedAt: null,
				isMainFileLost: false,
				teamId: null,
				createdAt: 1_700_000_000_000,
				updatedAt: "1700000000000000",
			};

			// 1. Seed the local row via a first `bulkUpsertFromServer` with
			//    the CDN URLs present. This lands in Dexie only (no OPFS,
			//    no CDN PUT) so it works uniformly across Chromium/WebKit —
			//    `upsertLocal`'s `FileSystemWritableFileStream` path has
			//    quirky Safari support and is not what we're testing here.
			await proxy.filesDb.bulkUpsertFromServer([
				{
					...baseRow,
					cdnUrl: "https://fake-cdn.example.com/main.png",
					thumbnailCdnUrl: "https://fake-cdn.example.com/thumb.png",
				},
			]);

			// 2. Simulate a pull cycle running when the server row hasn't
			//    yet been updated with the CDN URLs (mirrors the mid-race
			//    window between "uploaded to CDN" and "server acknowledged
			//    via pushCdnUpdates"). Without the merge policy's
			//    `?? existing` fallback, this would clobber the local URLs.
			await proxy.filesDb.bulkUpsertFromServer([
				{
					...baseRow,
					cdnUrl: null,
					thumbnailCdnUrl: null,
				},
			]);

			// 3. Read the row back to observe the merged state.
			const merged = await proxy.filesDb.getById(fileId);
			return {
				cdnUrl: merged?.cdnUrl ?? null,
				thumbnailCdnUrl: merged?.thumbnailCdnUrl ?? null,
				mainUploadState: merged?.mainUploadState ?? null,
				thumbnailUploadState: merged?.thumbnailUploadState ?? null,
			};
		});

		// The client-only URLs must survive the server-null pull.
		expect(result.cdnUrl).toBe("https://fake-cdn.example.com/main.png");
		expect(result.thumbnailCdnUrl).toBe("https://fake-cdn.example.com/thumb.png");
		// Upload state must also be preserved from the previous merge —
		// a regression that reset it to `pending` would cause the
		// FileUploadWorker to re-upload the row on every cycle.
		expect(result.mainUploadState).toBe("uploaded");
		expect(result.thumbnailUploadState).toBe("uploaded");
	});
});
