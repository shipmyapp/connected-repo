import {
	generatePresignedUrlService,
	isAllowedContentType,
} from "@backend/modules/cdn/services/generate_presigned_url.cdn.services";
import { describe, expect, it } from "vitest";

describe("presigner", () => {
	it.each([
		"image/svg+xml",
		"text/html",
		"Image/PNG",
		"image/png; x=1",
		" image/png",
	])("refuses %s", (type) => expect(isAllowedContentType(type)).toBe(false));
	it("accepts what browsers send", () => {
		for (const type of ["image/png", "image/jpeg", "image/webp", "application/pdf", "video/mp4"]) {
			expect(isAllowedContentType(type)).toBe(true);
		}
	});
	it("puts the object under <team>/<uploader>/", async () => {
		const result = await generatePresignedUrlService(
			{ fileName: "a.png", resourceType: "media", contentType: "image/png", contentLength: 10 },
			"user-1",
			"team-1",
		);
		expect(result.key.startsWith("team-1/user-1/media/")).toBe(true);
		await expect(
			generatePresignedUrlService(
				{
					fileName: "a.svg",
					resourceType: "media",
					contentType: "image/svg+xml",
					contentLength: 10,
				},
				"user-1",
				"team-1",
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
