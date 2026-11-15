import { type GoogleOptions, google } from "better-auth/social-providers";

/**
 * The Google provider for one id-token sign-in. A native app's Google id
 * token carries that app's client id in `aud`, not the web one, and Better
 * Auth verifies the token against the `clientId` its provider was built with
 * (the provider reads its own options; a property set on the provider object
 * afterwards is never read). So a token from a known native client gets a
 * provider built for that client, for this request only. Null: keep the web
 * provider.
 */
export function googleProviderForAudience(
	webOptions: GoogleOptions,
	audience: unknown,
	nativeClientIds: readonly (string | undefined)[],
): ReturnType<typeof google> | null {
	if (typeof audience !== "string" || audience === "") return null;
	if (!nativeClientIds.includes(audience)) return null;
	return google({ ...webOptions, clientId: audience });
}
