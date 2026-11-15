import { google } from "better-auth/social-providers";
import { describe, expect, it } from "vitest";
import { googleProviderForAudience } from "./native_google.lib";

const web = { clientId: "web.apps.googleusercontent.com", clientSecret: "secret" };
const nativeIds = ["ios.apps.googleusercontent.com", undefined];

describe("googleProviderForAudience", () => {
	it("documents why the old swap did nothing: the provider reads its own options", () => {
		const shared = google(web);
		Object.assign(shared, { clientId: "ios.apps.googleusercontent.com" });
		expect(shared.options?.clientId).toBe("web.apps.googleusercontent.com");
	});

	it("builds a provider for the native client id, leaving the web options alone", () => {
		const provider = googleProviderForAudience(web, "ios.apps.googleusercontent.com", nativeIds);
		expect(provider?.id).toBe("google");
		expect(provider?.options?.clientId).toBe("ios.apps.googleusercontent.com");
		expect(provider?.options?.clientSecret).toBe("secret");
		expect(web.clientId).toBe("web.apps.googleusercontent.com");
	});

	it("keeps the web provider for the web audience, an unknown one, a list or nothing", () => {
		expect(googleProviderForAudience(web, "web.apps.googleusercontent.com", nativeIds)).toBeNull();
		expect(googleProviderForAudience(web, "someone-else", nativeIds)).toBeNull();
		expect(
			googleProviderForAudience(web, ["ios.apps.googleusercontent.com"], nativeIds),
		).toBeNull();
		expect(googleProviderForAudience(web, undefined, nativeIds)).toBeNull();
		expect(googleProviderForAudience(web, "", [""])).toBeNull();
	});
});
