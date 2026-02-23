import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import { env, isDev, isProd, isTest } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { logger } from "@backend/utils/logger.utils";
import { recordErrorOtel } from "@backend/utils/record-message.otel.utils";
import { themeSettingZod } from "@connected-repo/zod-schemas/enums.zod";
import { uniqueTimeArrayZod, zTimezone } from "@connected-repo/zod-schemas/zod_utils";
import { betterAuth } from "better-auth";
import { orchidAdapter } from "./orchid-adapter/factory.orchid_adapter";

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
			domain: env.PROD_COOKIE_DOMAIN
		},
		defaultCookieAttributes: {
			httpOnly: true,
			secure: true,
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
		enabled: isTest,
	},
	// Leads to session leakage. Probably need to check the adapter implementation first.
	// experimental: {
	// 	joins: true,
	// },
	logger: {
		disabled: false,
		disableColors: !isDev,
		// Level is handled in logger utility.
		level: "debug",
		log: (level, message, ...args) => {
			// Map Better Auth log levels to Pino log levels
			switch (level) {
				case "debug":
					logger.debug({ module: "better-auth", ...args }, message);
					break;
				case "info":
					logger.info({ module: "better-auth", ...args }, message);
					break;
				case "warn":
					logger.warn({ module: "better-auth", ...args }, message);
					break;
				case "error":
					logger.error({ module: "better-auth", ...args }, message);
					break;
				default:
					logger.info({ module: "better-auth", ...args }, message);
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
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
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
					output: zTimezone
				}
			},
			themeSetting: {
				type: "string",
				required: true,
				defaultValue: "system",
				input: true,
				validator: {
					input: themeSettingZod,
					output: themeSettingZod
				}
			},
			journalReminderTimes: {
				type: "string[]",
				required: true,
				defaultValue: [],
				input: true,
				validator: {
					input: uniqueTimeArrayZod,
					output: uniqueTimeArrayZod,
				}
			}
		},
		modelName: "users",
	},
	verification: {
		modelName: "verifications",
	},
});

export type BetterAuthSession = typeof auth.$Infer.Session;