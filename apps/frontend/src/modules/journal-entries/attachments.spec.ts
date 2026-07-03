import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../../../e2e/fixtures";

// Playwright runs this file as an ES module (see playwright.config.ts) —
// CommonJS `__dirname` isn't defined. Derive it from `import.meta.url`
// so path.join for the fixture image resolves relative to this file.
const __dirname_esm = path.dirname(fileURLToPath(import.meta.url));

/**
 * Regression coverage for two hard-to-unit-test bug classes that live
 * in the sync pipeline. Both are golden-path e2e — they don't reproduce
 * the underlying race, but they fail loudly if the pipeline ever loses
 * the invariants the fixes established.
 *
 *  - `authLoader` cookieCache fallback: `getDefaultTeam` heals a
 *    session whose `activeTeamAppId` came back null from better-auth.
 *    The workspace chip resolving to a real team name (not "Loading…")
 *    is the observable proof that the fallback ran.
 *
 *  - `filesDb.bulkUpsertFromServer` null-guard: a pull cycle running
 *    between "thumbnail uploaded to CDN" and "thumbnail URL pushed to
 *    server" used to clobber the local `thumbnailCdnUrl`, permanently
 *    stranding the row with state=`uploaded` and url=`null`. The
 *    detail view rendered its fallback icon instead of the image. If
 *    the merge regresses, the second test fails: the `<img>` element
 *    for the attachment never resolves.
 */

const FIXTURE_IMAGE = path.join(
	__dirname_esm,
	"__fixtures__",
	"attachment-fixture.png",
);

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

	test("entry with image attachment shows thumbnail in detail view", async ({
		page,
	}) => {
		await page.goto("/journal-entries");
		await page.waitForLoadState("networkidle");

		// Navigate to the create form. Handles both the "no entries yet"
		// empty state and the "have entries" list view.
		const emptyStateCta = page.getByRole("button", {
			name: "Create Your First Entry",
		});
		const headerCta = page.getByRole("link", { name: "New Entry" });
		if (await emptyStateCta.isVisible()) {
			await emptyStateCta.click();
		} else {
			await headerCta.click();
		}
		await page.waitForURL(/\/journal-entries\/new/, { timeout: 10000 });

		// Fill content. The form's text field is the only one on the page
		// so a role-based locator is unambiguous.
		const content = `attachment-regression-${Date.now()}`;
		await page.getByRole("textbox").fill(content);

		// Attach the fixture image. MUI's uploader renders a hidden
		// <input type="file"> — `setInputFiles` on the first one is
		// stable across UI restyles.
		await page.locator('input[type="file"]').first().setInputFiles(FIXTURE_IMAGE);

		await page.getByRole("button", { name: /Save Entry/i }).click();
		await page.waitForURL(/\/journal-entries(?!\/new)/, { timeout: 15000 });

		// Open the entry we just created and wait for the attachment
		// pipeline to complete. `pushCdnUpdates` typically settles inside
		// one sync cycle; give it up to 20s so this doesn't flake on slow
		// CI runners.
		await page.getByText(content).first().click();
		await page.waitForURL(/\/journal-entries\/[^/]+$/, { timeout: 10000 });

		const attachmentImage = page.locator('img[alt*="attachment-fixture"]').first();

		// Success means the merge policy preserved `thumbnailCdnUrl`
		// through any pull cycles that ran during the upload. Failure
		// mode: MUI renders the "HideImage" fallback icon instead of an
		// <img>, so the locator never resolves.
		await expect(attachmentImage).toBeVisible({ timeout: 20000 });

		// Belt-and-suspenders: verify the src is a real R2 URL, not an
		// object URL fallback or empty string.
		const src = await attachmentImage.getAttribute("src");
		expect(src).toBeTruthy();
		expect(src).toMatch(/^https:\/\//);
	});
});
