import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { guardedLookup, isBlockedAddress, signWebhookBody } from "./ssrf_guard.utils";

describe("webhook guard", () => {
	it("blocks private and loopback addresses", () => {
		expect(isBlockedAddress("10.0.0.1", 4)).toBe(true);
		expect(isBlockedAddress("::1", 6)).toBe(true);
		expect(isBlockedAddress("93.184.216.34", 4)).toBe(false);
	});

	it("refuses a host that resolves to loopback at connect time", async () => {
		const error = await new Promise<Error | null>((resolve) =>
			guardedLookup("localhost", {}, (err) => resolve(err)),
		);
		expect(error?.name).toBe("SsrfBlockedError");
	});

	it("signs t.body with the secret", () => {
		const expected = createHmac("sha256", "s3cret").update('1700000000.{"a":1}').digest("hex");
		expect(signWebhookBody("s3cret", '{"a":1}', 1_700_000_000)).toBe(`t=1700000000,v1=${expected}`);
	});
});
