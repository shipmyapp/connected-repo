import { env } from "@backend/configs/env.config";
import { describe, expect, it } from "vitest";
import { assertOwnCdnUrl, isAllowedCdnUrl } from "./cdn_url.utils";

const publicBase = env.S3_PUBLIC_URL ?? env.S3_ENDPOINT;

describe("storage URL allowlist", () => {
	it("accepts the public bucket URL and the endpoint", () => {
		expect(isAllowedCdnUrl(new URL("/t/logo.png", publicBase).href)).toBe(true);
		expect(isAllowedCdnUrl(new URL("/b/t/logo.png", env.S3_ENDPOINT).href)).toBe(true);
	});
	it("refuses another host, a look-alike, another scheme and a non-URL", () => {
		const host = new URL(publicBase).host;
		expect(isAllowedCdnUrl("https://evil.example.com/logo.png")).toBe(false);
		expect(isAllowedCdnUrl(`https://${host}.evil.example/x.png`)).toBe(false);
		expect(isAllowedCdnUrl(`javascript://${host}/%0aalert(1)`)).toBe(false);
		expect(isAllowedCdnUrl("not a url")).toBe(false);
	});
	it("lets null through and throws on a foreign URL", () => {
		expect(() => assertOwnCdnUrl(null, "logoUrl")).not.toThrow();
		expect(() => assertOwnCdnUrl("https://evil.example.com/a.png", "logoUrl")).toThrow(/logoUrl/);
	});
});
