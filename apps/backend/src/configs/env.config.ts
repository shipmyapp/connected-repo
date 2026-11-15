import fs from "node:fs";
import path from "node:path";
import { NODE_ENV_ZOD } from "@connected-repo/zod-schemas/node_env";
import { zString } from "@connected-repo/zod-schemas/zod_utils";
import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables based on NODE_ENV
const nodeEnv = process.env.NODE_ENV;

if (nodeEnv === "test") {
	// In test environment, only load .env.test or .env.test.local
	const testEnvPath = path.resolve(process.cwd(), ".env.test");
	const testEnvLocalPath = path.resolve(process.cwd(), ".env.test.local");

	// Check if at least one test env file exists
	const testEnvExists = fs.existsSync(testEnvPath);
	const testEnvLocalExists = fs.existsSync(testEnvLocalPath);

	if (!testEnvExists && !testEnvLocalExists) {
		throw new Error(
			"Test environment requires .env.test or .env.test.local file to be present. " +
				"Please create one of these files in apps/backend/",
		);
	}

	// Load test env files (local overrides base)
	if (testEnvExists) {
		dotenv.config({ path: testEnvPath, quiet: true });
	}
	if (testEnvLocalExists) {
		dotenv.config({ path: testEnvLocalPath, override: true, quiet: true });
	}
} else {
	// For non-test environments, load in cascading order
	dotenv.config({ path: ".env", quiet: true });
	dotenv.config({ path: ".env.local", override: true, quiet: true });
	dotenv.config({ path: `.env.${nodeEnv}`, override: true, quiet: true });
	dotenv.config({ path: `.env.${nodeEnv}.local`, override: true, quiet: true });
}

const optionalUrl = z.preprocess((val) => (val === "" ? undefined : val), z.url().optional());
const optionalString = z.preprocess((val) => (val === "" ? undefined : val), z.string().optional());

const envSchema = z.object({
	ALLOWED_ORIGINS: zString.optional(),
	// better-auth's cookie name prefix (default `better-auth`). Set only when
	// two stacks share a parent cookie domain (e.g. staging and production
	// on `.example.com`). Never change it on a live environment.
	AUTH_COOKIE_PREFIX: z
		.string()
		.regex(/^[a-z0-9-]+$/, "AUTH_COOKIE_PREFIX: lowercase letters, digits and hyphens")
		.optional(),
	BETTER_AUTH_SECRET: zString.min(32, "Better Auth secret must be at least 32 characters"),
	DB_HOST: zString.min(1),
	DB_PORT: zString.min(1),
	DB_USER: zString.min(1),
	DB_PASSWORD: zString.min(1),
	DB_NAME: zString.min(1),
	DB_SCHEMA: zString.min(1),
	// TLS to Postgres. `disable` for a database on the same Docker network;
	// a managed database wants `verify-full` with its CA certificate in
	// DB_SSL_CA (PEM; literal `\n` sequences are accepted for one-line env
	// values), or at least `require` (encrypted, server not verified).
	DB_SSL: z.enum(["disable", "require", "verify-full"]).default("disable"),
	DB_SSL_CA: optionalString,
	// pg pool size. Default 25 — node-postgres default of 10 is too tight under
	// concurrent oRPC traffic on a shared cluster. Tune via env per environment.
	DB_POOL_SIZE: z.coerce.number().int().min(1).default(25),
	GOOGLE_WEB_CLIENT_ID: zString.min(1).includes(".apps.googleusercontent.com"),
	GOOGLE_WEB_CLIENT_SECRET: zString.min(1),
	GOOGLE_IOS_CLIENT_ID: zString.optional(),
	GOOGLE_ANDROID_CLIENT_ID: zString.optional(),
	HOST: optionalString,
	INTERNAL_API_SECRET: zString
		.min(32, "Internal API secret must be at least 32 characters")
		.optional(),
	IS_E2E_TEST: z.stringbool().optional(),
	LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).optional(),
	NODE_ENV: NODE_ENV_ZOD,
	OTEL_SERVICE_NAME: zString.min(1),
	OTEL_TRACE_EXPORTER_URL: z.url().optional(),
	PG_TBUS_CONCURRENCY: z.coerce.number().int().min(1).default(3),
	PORT: z.coerce.number().default(3000),
	// Redis 7 (required, next to Postgres). Holds the rate-limit buckets only;
	// never the source of truth, so it can be flushed without losing data.
	// e.g. redis://localhost:6379, redis://:password@redis:6379/0, rediss://… for TLS.
	REDIS_URL: z.url(),
	PROD_COOKIE_DOMAIN: optionalString,
	// Root domain of team hosts (`<slug>.<root>`), e.g. `example.com`; `localhost`
	// in dev. Unset = tenant mode off, every host is the shared app. In
	// production pair it with PROD_COOKIE_DOMAIN=.<root> (or a parent of it).
	TENANT_ROOT_DOMAIN: optionalString,
	SESSION_SECRET: zString.min(32, "Session secret must be at least 32 characters"),
	NOVU_SECRET_KEY: optionalString,
	NOVU_API_URL: optionalUrl,
	// Backend-native Sentry env names. Frontend keeps its own VITE_SENTRY_* keys.
	SENTRY_DSN: optionalUrl,
	SENTRY_ENVIRONMENT: optionalString,
	SENTRY_RELEASE: optionalString,
	SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
	SENTRY_PROFILES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
	// Comma-separated list of emails/phones with super-admin access (see rpcSuperAdminProcedure).
	SUPER_ADMIN_EMAILS: optionalString,
	SUPER_ADMIN_PHONE_NUMBERS: optionalString,
	// Trusted proxy hops counted from the right of X-Forwarded-For. 0: no
	// proxy, the socket address is the client (host-mode dev, tests).
	// Deployed and dev-compose stacks (the app's nginx in front): 1.
	TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).max(5).default(0),
	VITE_API_URL: z.url(),
	WEBAPP_URL: z.url(),
	S3_ENDPOINT: z.url(),
	S3_REGION: zString.min(1),
	S3_ACCESS_KEY_ID: zString.min(1),
	S3_SECRET_ACCESS_KEY: zString.min(1),
	S3_BUCKET_NAME: zString.min(1),
	S3_PUBLIC_URL: optionalUrl,
	APPLE_CLIENT_ID: zString.optional(),
	APPLE_TEAM_ID: zString.optional(),
	APPLE_KEY_ID: zString.optional(),
	APPLE_PRIVATE_KEY: zString.optional(),
	APPLE_APP_BUNDLE_ID: zString.optional(),
	// Firebase Admin (server-side FCM) credentials — used by the silent-
	// sync cron to send data-only push directly, bypassing Novu.
	// Either GOOGLE_APPLICATION_CREDENTIALS (path to service-account JSON)
	// or FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON blob) works; leaving
	// both unset disables server-side push. Prefer the inline var for
	// containerised deploys where filesystem is ephemeral.
	FIREBASE_SERVICE_ACCOUNT_JSON: optionalString,
});

// ----------------------------------------
// Final Schema & Export
// ----------------------------------------

/**
 * Rules across variables. Every subdomain of TENANT_ROOT_DOMAIN shares the
 * session cookie (`PROD_COOKIE_DOMAIN=.<root>`) and is same-site with the
 * app, so the bucket's public host (user content) must live on another
 * domain.
 */
const checkedEnvSchema = envSchema.superRefine((values, ctx) => {
	if (values.TENANT_ROOT_DOMAIN && values.S3_PUBLIC_URL) {
		const root = values.TENANT_ROOT_DOMAIN.toLowerCase().replace(/^\.+/, "");
		let host = "";
		try {
			host = new URL(values.S3_PUBLIC_URL).hostname.toLowerCase();
		} catch {
			return; // the field's own check reports a malformed URL
		}
		if (host === root || host.endsWith(`.${root}`)) {
			ctx.addIssue({
				code: "custom",
				path: ["S3_PUBLIC_URL"],
				message:
					"S3_PUBLIC_URL must not be TENANT_ROOT_DOMAIN or a subdomain of it: uploaded files would share the session cookie. Serve the bucket from another domain.",
			});
		}
	}
});

/**
 * Parses an environment. A blank value means "not set": Dokploy's
 * environment editor and a `KEY=` line in a .env both hand us "", which
 * `z.url().optional()` reads as a malformed URL, `z.enum().optional()`
 * rejects, and `z.coerce.number()` turns into 0 (a sample rate of 0, a pool
 * of 0, port 0) instead of the default. Dropping "" before parsing makes
 * every optional or defaulted variable fall back as intended; a required
 * one left blank is still refused, and a set-but-wrong value still fails.
 */
export const parseEnv = (source: NodeJS.ProcessEnv) =>
	checkedEnvSchema.parse(
		Object.fromEntries(Object.entries(source).filter(([, value]) => value !== "")),
	);

export const env = parseEnv(process.env);

// Environment helpers
export const isDev = env.NODE_ENV === "development";
export const isProd = env.NODE_ENV === "production";
export const isStaging = env.NODE_ENV === "staging";
export const isTest = env.NODE_ENV === "test";

const EXAMPLE_AUTH_SECRET_PREFIX = "32-characters-or-more-better-auth-secret";

/**
 * Why these values must not serve production or staging traffic, or null.
 * Checked by server.ts before listening (not in the schema: the image's
 * smoke test validates the committed example on purpose).
 */
export const deploymentEnvProblem = (values: {
	NODE_ENV: string;
	BETTER_AUTH_SECRET: string;
}): string | null =>
	(values.NODE_ENV === "production" || values.NODE_ENV === "staging") &&
	values.BETTER_AUTH_SECRET.startsWith(EXAMPLE_AUTH_SECRET_PREFIX)
		? "BETTER_AUTH_SECRET is the example value; generate one with `openssl rand -base64 48`"
		: null;
