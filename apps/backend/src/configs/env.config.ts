import { NODE_ENV_ZOD } from "@connected-repo/zod-schemas/node_env";
import { zString } from "@connected-repo/zod-schemas/zod_utils";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
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

const envSchema = z.object({
	ALLOWED_ORIGINS: zString.optional(),
	BETTER_AUTH_SECRET: zString.min(32, "Better Auth secret must be at least 32 characters"),
	CRON_JOB_ALLOWED_ORIGIN: z.preprocess((val) => (val === "" ? undefined : val), z.url().optional()),
	CRON_JOB_TOKEN: zString.min(32, "Cron job token must be at least 32 characters"),
	DB_HOST: zString.min(1),
	DB_PORT: zString.min(1),
	DB_USER: zString.min(1),
	DB_PASSWORD: zString.min(1),
	DB_NAME: zString.min(1),
	DB_SCHEMA: zString.min(1),
	GOOGLE_CLIENT_ID: zString.min(1).includes(".apps.googleusercontent.com"),
	GOOGLE_CLIENT_SECRET: zString.min(1),
	INTERNAL_API_SECRET: zString.min(32, "Internal API secret must be at least 32 characters").optional(),
	IS_E2E_TEST: z.stringbool().optional(),
	NODE_ENV: NODE_ENV_ZOD,
	OTEL_SERVICE_NAME: zString.min(1),
	OTEL_TRACE_EXPORTER_URL: z.url().optional(),
	PORT: z.coerce.number().default(3000),
	SESSION_SECRET: zString.min(32, "Session secret must be at least 32 characters"),
	SUPRSEND_API_KEY: zString.min(1),
	SUPRSEND_API_SECRET: zString.min(1),
	VITE_SENTRY_DSN: z.preprocess((val) => (val === "" ? undefined : val), z.url().optional()),
	VITE_SENTRY_ENV: zString.optional(),
	VITE_API_URL: z.url(),
	WEBAPP_URL: z.url(),
	S3_ENDPOINT: z.url(),
	S3_REGION: zString.min(1),
	S3_ACCESS_KEY_ID: zString.min(1),
	S3_SECRET_ACCESS_KEY: zString.min(1),
	S3_BUCKET_NAME: zString.min(1),
	S3_PUBLIC_URL: z.preprocess((val) => (val === "" ? undefined : val), z.url().optional()),
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
