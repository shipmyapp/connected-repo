import { expect, test } from "../../../e2e/fixtures";

/** What the test build puts on `window.__testHooks` (main.tsx), as far as this spec uses it. */
type MediaTestHooks = {
	__testHooks?: {
		getMediaProxy?: () => Promise<{
			media: {
				generateThumbnail: (file: File) => Promise<{ thumbnailFile: File | null; error?: string }>;
			};
		}>;
	};
};

/**
 * A PDF attachment gets a picture of its first page: pdf.js (its worker
 * loaded from the build's own asset) renders it in the MediaWorker onto an
 * OffscreenCanvas. Driven through the MediaWorker proxy the test build
 * exposes on `window.__testHooks`, so no CDN upload is needed.
 */
test("a PDF gets a thumbnail of its first page", async ({ page }) => {
	await page.goto("/journal-entries");
	await page.waitForLoadState("networkidle");
	await page.waitForFunction(
		() => (window as Window & MediaTestHooks).__testHooks?.getMediaProxy != null,
		null,
		{ timeout: 10_000 },
	);

	const result = await page.evaluate(async () => {
		// A one-page PDF: a blue square on a 200 × 200 page.
		const objects = [
			"<</Type/Catalog/Pages 2 0 R>>",
			"<</Type/Pages/Kids[3 0 R]/Count 1>>",
			"<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>",
			"<</Length 28>>\nstream\n0 0 1 rg 20 20 160 160 re f\nendstream",
		];
		let body = "%PDF-1.4\n";
		const offsets: number[] = [];
		objects.forEach((object, index) => {
			offsets.push(body.length);
			body += `${index + 1} 0 obj\n${object}\nendobj\n`;
		});
		const xref = body.length;
		body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
		for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
		body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
		const file = new File([body], "square.pdf", { type: "application/pdf" });

		const getMediaProxy = (window as Window & MediaTestHooks).__testHooks?.getMediaProxy;
		if (!getMediaProxy) throw new Error("the test hooks are not loaded");
		const proxy = await getMediaProxy();
		const { thumbnailFile, error } = await proxy.media.generateThumbnail(file);
		return {
			error: error ?? null,
			type: thumbnailFile?.type ?? null,
			size: thumbnailFile?.size ?? 0,
		};
	});

	expect(result.error).toBeNull();
	expect(result.type).toMatch(/^image\//);
	expect(result.size).toBeGreaterThan(0);
});
