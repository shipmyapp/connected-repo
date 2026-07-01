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
		dotenv.config({ path: testEnvPath });
	}
	if (testEnvLocalExists) {
		dotenv.config({ path: testEnvLocalPath, override: true });
	}
} else {
	// For non-test environments, load in cascading order
	dotenv.config({ path: ".env" });
	dotenv.config({ path: ".env.local", override: true });
	dotenv.config({ path: `.env.${nodeEnv}`, override: true });
	dotenv.config({ path: `.env.${nodeEnv}.local`, override: true });
}

const optionalUrl = z.preprocess(
	(val) => (val === "" ? undefined : val),
	z.url().optional(),
);
const optionalString = z.preprocess(
	(val) => (val === "" ? undefined : val),
	z.string().optional(),
);

const envSchema = z.object({
	ALLOWED_ORIGINS: zString.optional(),
	BETTER_AUTH_SECRET: zString.min(
		32,
		"Better Auth secret must be at least 32 characters",
	),
	DB_HOST: zString.min(1),
	DB_PORT: zString.min(1),
	DB_USER: zString.min(1),
	DB_PASSWORD: zString.min(1),
	DB_NAME: zString.min(1),
	DB_SCHEMA: zString.min(1),
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
	LOG_LEVEL: z
		.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
		.optional(),
	NODE_ENV: NODE_ENV_ZOD,
	OTEL_SERVICE_NAME: zString.min(1),
	OTEL_TRACE_EXPORTER_URL: z.url().optional(),
	PG_TBUS_CONCURRENCY: z.coerce.number().int().min(1).default(3),
	PORT: z.coerce.number().default(3000),
	PROD_COOKIE_DOMAIN: optionalString,
	SESSION_SECRET: zString.min(
		32,
		"Session secret must be at least 32 characters",
	),
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
});

// ----------------------------------------
// Final Schema & Export
// ----------------------------------------
export const env = envSchema.parse(process.env);

// Environment helpers
export const isDev = env.NODE_ENV === "development";
export const isProd = env.NODE_ENV === "production";
export const isStaging = env.NODE_ENV === "staging";
export const isTest = env.NODE_ENV === "test";
