import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import { env, isDev, isProd, isStaging, isTest } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { logger } from "@backend/utils/logger.utils";
import { themeSettingZod } from "@connected-repo/zod-schemas/enums.zod";
import { uniqueTimeArrayZod, zTimezone } from "@connected-repo/zod-schemas/zod_utils";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { bearer } from "better-auth/plugins";
import { apple, type GoogleOptions } from "better-auth/social-providers";
import { generateAppleClientSecret } from "./lib/apple.lib";
import { googleProviderForAudience } from "./lib/native_google.lib";
import { orchidAdapter } from "./orchid-adapter/factory.orchid_adapter";

// Apple Client Secret is a short-lived JWT (currently signed with a 1h expiry in
// apple.lib.ts). We cache the generated secret alongside its expiry and rebuild
// it lazily inside the auth `hooks.before` handler when it's within 60s of
// expiring. Without this, a long-lived process would keep serving an expired
// JWT and Apple would reject every /sign-in/social call with `invalid_client`.
const APPLE_SECRET_TTL_MS = 60 * 60 * 1000; // must stay <= JWT expiry in apple.lib.ts
const APPLE_SECRET_REFRESH_MARGIN_MS = 60 * 1000;

let appleClientSecretCache: { secret: string; expiresAt: number } | undefined;
let appleClientSecretInflight: Promise<string | undefined> | undefined;

async function getAppleClientSecret(): Promise<string | undefined> {
	if (!env.APPLE_CLIENT_ID || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY) {
		return undefined;
	}

	const now = Date.now();
	if (
		appleClientSecretCache &&
		now < appleClientSecretCache.expiresAt - APPLE_SECRET_REFRESH_MARGIN_MS
	) {
		return appleClientSecretCache.secret;
	}

	// De-dupe concurrent refreshes.
	if (appleClientSecretInflight) {
		return appleClientSecretInflight;
	}

	appleClientSecretInflight = (async () => {
		try {
			const secret = await generateAppleClientSecret({
				clientId: env.APPLE_CLIENT_ID as string,
				teamId: env.APPLE_TEAM_ID as string,
				keyId: env.APPLE_KEY_ID as string,
				privateKey: env.APPLE_PRIVATE_KEY as string,
			});
			appleClientSecretCache = {
				secret,
				expiresAt: Date.now() + APPLE_SECRET_TTL_MS,
			};
			return secret;
		} catch (err) {
			logger.error({ err }, "Failed to generate Apple Client Secret");
			return undefined;
		} finally {
			appleClientSecretInflight = undefined;
		}
	})();

	return appleClientSecretInflight;
}

// TODO: Instrument Better Auth with OpenTelemetry for automatic tracing
// This will automatically create spans for all auth operations including:
// - OAuth flows (initiate, callback) with user IDs
// - Email signin/signup with user IDs
// - Session management (get, list, revoke)
// - Account management (link, unlink, update, delete)
// - Password management (change, set, reset)
// - Email verification

// The web Google client. Native apps sign in with an id token issued to
// their own client id; `hooks.before` swaps in a provider built for that id
// for the one request (native_google.lib.ts).
const googleWebOptions = {
	clientId: env.GOOGLE_WEB_CLIENT_ID,
	clientSecret: env.GOOGLE_WEB_CLIENT_SECRET,
	prompt: "select_account",
	redirectURI: `${env.VITE_API_URL}/api/auth/callback/google`,
} satisfies GoogleOptions;

export const auth = betterAuth({
	account: {
		modelName: "accounts",
		// Google's and Apple's access and refresh tokens rest encrypted with
		// BETTER_AUTH_SECRET: a database copy must not hand out working tokens.
		// Rotating the secret makes stored tokens unreadable (they are
		// rewritten at the next sign-in; the template never reads them).
		encryptOAuthTokens: true,
		// Fresh provider tokens on every sign-in (Better Auth's default, stated).
		updateAccountOnSignIn: true,
	},
	advanced: {
		crossSubDomainCookies: {
			enabled: Boolean(isProd && env.PROD_COOKIE_DOMAIN),
			domain: env.PROD_COOKIE_DOMAIN,
		},
		defaultCookieAttributes: {
			httpOnly: true,
			// Secure in every real deployment (prod + staging), both served over
			// HTTPS. Left off only for local dev/test over http://localhost.
			secure: isProd || isStaging,
		},
		// Better Auth's limiter and sessions.ip_address use the address the
		// server stamped (main.handler.ts), never a client-sent header.
		ipAddress: {
			ipAddressHeaders: ["x-client-ip"],
		},
		database: {
			// Setting generateId to false allows your database handle all ID generation
			generateId: false,
		},
	},
	baseURL: env.VITE_API_URL,
	basePath: "/api/auth",
	database: orchidAdapter(db),
	databaseHooks: {
		account: {
			create: {
				// Better Auth links a Google/Apple sign-in to an existing user with
				// the same address when the provider says the address is verified,
				// then marks that user verified. If the existing user is NOT
				// verified, someone created it without proving the address (a
				// password sign-up, possible before email + password became
				// test-only). Their password and sessions must not survive into the
				// real owner's account: drop them before the link is written.
				before: async (account, endpoint) => {
					if (account.providerId === "credential") return;
					const owner = await db.users.findOptional(account.userId).select("emailVerified");
					// A brand-new user (created in the same transaction) or an
					// already-verified one: nothing to evict.
					if (!owner || owner.emailVerified) return;
					await db.accounts.where({ userId: account.userId, providerId: "credential" }).delete();
					if (endpoint) {
						// Through Better Auth, so its session-delete hooks run.
						await endpoint.context.internalAdapter.deleteSessions(account.userId);
					} else {
						await db.sessions.unscope("default").where({ userId: account.userId }).delete();
					}
				},
			},
		},
	},
	// Sign-in is Google, Apple and the bearer plugin. Email + password exists
	// only for the backend test harness and the e2e login (NODE_ENV=test).
	// Open anywhere else it lets anyone register an address they do not own.
	emailAndPassword: {
		enabled: isTest,
	},
	// Mobile clients send the signed token from the `set-auth-token` response
	// header. A raw sessions.token (stored in plain text) is not accepted.
	plugins: [bearer({ requireSignature: true })],
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			const appleClientSecret = await getAppleClientSecret();

			// Each request gets its own copy of the auth context, so providers
			// put in `ctx.context.socialProviders` here exist for this request
			// only. Never edit a provider object found in that list: it is
			// shared by every request, and better-auth reads a provider's
			// settings from the options it was built with, not from the object.

			// 1. Native iOS Apple provider, built with the current client secret.
			if (env.APPLE_APP_BUNDLE_ID && appleClientSecret) {
				ctx.context.socialProviders = [
					...ctx.context.socialProviders,
					{
						...apple({
							clientId: env.APPLE_APP_BUNDLE_ID,
							clientSecret: appleClientSecret,
							appBundleIdentifier: env.APPLE_APP_BUNDLE_ID,
						}),
						id: "apple_ios",
					},
				];
			}

			// 2. Native Google: an id token from the iOS or Android app is
			// verified against the client id it was issued to.
			if (ctx.path.endsWith("/sign-in/social") && ctx.method === "POST") {
				const idToken: unknown = ctx.body?.idToken?.token ?? ctx.body?.idToken;
				if (typeof idToken === "string") {
					try {
						const { decodeJwt } = await import("jose");
						const nativeGoogle = googleProviderForAudience(
							googleWebOptions,
							decodeJwt(idToken).aud,
							[env.GOOGLE_IOS_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_ID],
						);
						if (nativeGoogle) {
							ctx.context.socialProviders = ctx.context.socialProviders.map((p) =>
								p.id === "google" ? nativeGoogle : p,
							);
						}
					} catch {
						// Not a JWT: better-auth refuses it during verification.
					}
				}
			}
		}),
	},
	// Leads to session leakage. Probably need to check the adapter implementation first.
	// experimental: {
	// 	joins: true,
	// },
	logger: {
		disabled: false,
		disableColors: !isDev,
		// Level is handled in logger utility.
		level: isTest ? "error" : "debug",
		log: (level, message, ...args) => {
			// better-auth may pass Error objects or plain objects as trailing args.
			// Extract the first Error separately so pino serializes its stack,
			// and expose remaining args in a stable `details` field instead of
			// numeric-key spreading them (which loses everything on Error instances).
			const firstErr = args.find((a) => a instanceof Error) as Error | undefined;
			const otherArgs = args.filter((a) => a !== firstErr);
			const payload: Record<string, unknown> = {
				module: "better-auth",
				details: otherArgs.length ? otherArgs : undefined,
				err: firstErr,
			};
			switch (level) {
				case "debug":
					logger.debug(payload, message);
					break;
				case "info":
					logger.info(payload, message);
					break;
				case "warn":
					logger.warn(payload, message);
					break;
				case "error":
					logger.error(payload, message);
					break;
				default:
					logger.info(payload, message);
			}
		},
	},
	onAPIError: {
		errorURL: `${env.WEBAPP_URL}/auth/error`,
	},
	rateLimit: {
		// Better Auth's own per-process burst limiter on /api/auth/* (its
		// defaults: 3 sign-ins per 10 s per IP, 100 requests per 10 s). Off in
		// test mode, where the e2e suite signs several test users in a row.
		// The app's own limits are the Redis buckets (rate_limit.service.ts).
		enabled: !isTest,
		window: 10,
		max: 100,
		storage: "memory",
	},
	secret: env.BETTER_AUTH_SECRET,
	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days
		updateAge: 60 * 60 * 24, // 24 hours
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60, // 5 minutes
		},
		modelName: "sessions",
		additionalFields: {
			browser: {
				type: "string",
				required: false,
				input: false,
			},
			os: {
				type: "string",
				required: false,
				input: false,
			},
			device: {
				type: "string",
				required: false,
				input: false,
			},
			deviceFingerprint: {
				type: "string",
				required: false,
				input: false,
			},
			markedInvalidAt: {
				type: "date",
				required: false,
				defaultValue: null,
				input: false, // Don't allow user input for soft delete timestamp
			},
		},
	},
	socialProviders: {
		google: googleWebOptions,
	},
	telemetry: {
		enabled: false,
	},
	trustedOrigins: allowedOrigins,
	user: {
		changeEmail: {
			enabled: false, // Disable email changes for simplicity
		},
		additionalFields: {
			timezone: {
				defaultValue: "Etc/UTC",
				input: true,
				required: true,
				type: "string",
				validator: {
					input: zTimezone,
					output: zTimezone,
				},
			},
			themeSetting: {
				type: "string",
				required: true,
				defaultValue: "system",
				input: true,
				validator: {
					input: themeSettingZod,
					output: themeSettingZod,
				},
			},
			journalReminderTimes: {
				type: "string[]",
				required: true,
				defaultValue: [],
				input: true,
				validator: {
					input: uniqueTimeArrayZod,
					output: uniqueTimeArrayZod,
				},
			},
			activeTeamAppId: {
				type: "string",
				required: false,
				defaultValue: null,
				input: false,
			},
			// The phone columns stay on the user row (team invitations by phone,
			// the super-admin phone allowlist). No route writes them: phone
			// sign-in is not offered. Declared here so the session user keeps them.
			phoneNumber: {
				type: "string",
				required: false,
				defaultValue: null,
				input: false,
			},
			phoneNumberVerified: {
				type: "boolean",
				required: false,
				defaultValue: false,
				input: false,
			},
		},
		modelName: "users",
	},
	verification: {
		modelName: "verifications",
	},
});

export type BetterAuthSession = typeof auth.$Infer.Session;
