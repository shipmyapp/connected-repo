import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import { env, isDev, isProd, isStaging, isTest } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { logger } from "@backend/utils/logger.utils";
import { themeSettingZod } from "@connected-repo/zod-schemas/enums.zod";
import {
	uniqueTimeArrayZod,
	zTimezone,
} from "@connected-repo/zod-schemas/zod_utils";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { bearer, phoneNumber } from "better-auth/plugins";
import { apple } from "better-auth/social-providers";
import { generateAppleClientSecret } from "./lib/apple.lib";
import { orchidAdapter } from "./orchid-adapter/factory.orchid_adapter";

// Apple Client Secret is a short-lived JWT (currently signed with a 1h expiry in
// apple.lib.ts). We cache the generated secret alongside its expiry and rebuild
// it lazily inside the auth `hooks.before` handler when it's within 60s of
// expiring. Without this, a long-lived process would keep serving an expired
// JWT and Apple would reject every /sign-in/social call with `invalid_client`.
const APPLE_SECRET_TTL_MS = 60 * 60 * 1000; // must stay <= JWT expiry in apple.lib.ts
const APPLE_SECRET_REFRESH_MARGIN_MS = 60 * 1000;

let appleClientSecretCache:
	| { secret: string; expiresAt: number }
	| undefined;
let appleClientSecretInflight: Promise<string | undefined> | undefined;

async function getAppleClientSecret(): Promise<string | undefined> {
	if (
		!env.APPLE_CLIENT_ID ||
		!env.APPLE_TEAM_ID ||
		!env.APPLE_KEY_ID ||
		!env.APPLE_PRIVATE_KEY
	) {
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

export const auth = betterAuth({
	account: {
		modelName: "accounts",
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
		database: {
			// Setting generateId to false allows your database handle all ID generation
			generateId: false,
		},
	},
	baseURL: env.VITE_API_URL,
	basePath: "/api/auth",
	database: orchidAdapter(db),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		bearer(),
		phoneNumber({
			sendOTP: async ({ phoneNumber, code }, _ctx) => {
				logger.info({ phoneNumber, code }, "Sending phone number OTP");
				// TODO: Implement actual SMS provider here
			},
			signUpOnVerification: {
				getTempEmail: (phoneNumber) => `${phoneNumber}@temp-local.com`,
				getTempName: (phoneNumber) => phoneNumber,
			},
		}),
	],
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			const appleClientSecret = await getAppleClientSecret();

			// 1. Update static web apple provider if it exists
			const appleWebProvider = ctx.context.socialProviders.find(
				(p) => p.id === "apple",
			);
			if (appleWebProvider && appleClientSecret) {
				(appleWebProvider as any).clientSecret = appleClientSecret;
			}

			// 2. Add native iOS apple provider dynamically
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

			// 3. Dynamic Google Client ID for Native Apps
			// Social sign-in from native apps sends an idToken. We must match the clientId
			// to the 'aud' (audience) in the token for verification to pass.
			if (ctx.path.endsWith("/sign-in/social") && ctx.method === "POST") {
				const body = (ctx as any).body;
				const idToken = body?.idToken;

				if (idToken) {
					try {
						const { decodeJwt } = await import("jose");
						const payload = decodeJwt(idToken);
						const aud = payload.aud as string;

						if (
							aud &&
							(aud === env.GOOGLE_IOS_CLIENT_ID ||
								aud === env.GOOGLE_ANDROID_CLIENT_ID)
						) {
							const googleProvider = ctx.context.socialProviders.find(
								(p) => p.id === "google",
							);
							if (googleProvider) {
								(googleProvider as any).clientId = aud;
								logger.debug(
									{ aud },
									"Swapping Google Client ID for native app",
								);
							}
						}
					} catch (_err) {
						// Ignore decode errors, better-auth will handle verification
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
			const firstErr = args.find((a) => a instanceof Error) as
				| Error
				| undefined;
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
		enabled: true,
		window: 10,
		max: 100,
		storage: "memory",
		// TODO: Enable database rate limiting
		// storage: "database",
		// modelName: "betterauth_ratelimit"
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
		google: {
			clientId: env.GOOGLE_WEB_CLIENT_ID,
			clientSecret: env.GOOGLE_WEB_CLIENT_SECRET,
			prompt: "select_account",
			redirectURI: `${env.VITE_API_URL}/api/auth/callback/google`,
		},
	},
	telemetry: {
		enabled: true,
	},
	trustedOrigins: allowedOrigins,
	updateAccountOnSignin: true,
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
		},
		modelName: "users",
	},
	verification: {
		modelName: "verifications",
	},
});

export type BetterAuthSession = typeof auth.$Infer.Session;
