import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { describe, expect, it } from "vitest";
import { s3Client } from "./s3.client";

describe("s3Client presigned PUT", () => {
	it("signs no body checksum, which the browser's upload could never match", async () => {
		const signedUrl = await getSignedUrl(
			s3Client,
			new PutObjectCommand({
				Bucket: "test-bucket",
				Key: "team/journal_entry/01J0000000000000000000000A_photo.jpg",
				ContentType: "image/jpeg",
				ContentLength: 1234,
			}),
			{
				expiresIn: 900,
				signableHeaders: new Set(["content-length", "content-type"]),
			},
		);
		const params = [...new URL(signedUrl).searchParams.keys()].map((key) => key.toLowerCase());

		expect(params.filter((key) => key.startsWith("x-amz-checksum-"))).toEqual([]);
		expect(params).not.toContain("x-amz-sdk-checksum-algorithm");
	});
});
