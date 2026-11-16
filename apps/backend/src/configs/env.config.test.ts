import { describe, expect, it } from "vitest";
import { deploymentEnvProblem, parseEnv } from "./env.config";

// The test process has already loaded .env.test (and NODE_ENV=test), so
// process.env satisfies the schema; each case overrides a few keys.
const withValues = (overrides: Record<string, string>) =>
	parseEnv({ ...process.env, ...overrides });

describe("the env schema reads a blank value as unset", () => {
	it("falls back to the default of every blank optional or defaulted variable", () => {
		const env = withValues({
			NOVU_API_URL: "",
			DB_POOL_SIZE: "",
			PG_TBUS_CONCURRENCY: "",
			PORT: "",
			LOG_LEVEL: "",
			IS_E2E_TEST: "",
			SENTRY_TRACES_SAMPLE_RATE: "",
			SENTRY_PROFILES_SAMPLE_RATE: "",
			DB_SSL: "",
		});
		expect(env.NOVU_API_URL).toBeUndefined();
		expect(env.DB_POOL_SIZE).toBe(25);
		expect(env.PG_TBUS_CONCURRENCY).toBe(3);
		expect(env.PORT).toBe(3000);
		expect(env.LOG_LEVEL).toBeUndefined();
		expect(env.IS_E2E_TEST).toBeUndefined();
		// Before: "" coerced to 0, which switched tracing off.
		expect(env.SENTRY_TRACES_SAMPLE_RATE).toBeUndefined();
		expect(env.SENTRY_PROFILES_SAMPLE_RATE).toBeUndefined();
		expect(env.DB_SSL).toBe("disable");
	});

	it("still refuses a value that is set but wrong", () => {
		expect(() => withValues({ NOVU_API_URL: "not a url" })).toThrow(/NOVU_API_URL/);
		expect(() => withValues({ DB_POOL_SIZE: "0" })).toThrow(/DB_POOL_SIZE/);
		expect(() => withValues({ DB_SSL: "sometimes" })).toThrow(/DB_SSL/);
	});

	it("refuses a required variable left blank", () => {
		expect(() => withValues({ BETTER_AUTH_SECRET: "" })).toThrow(/BETTER_AUTH_SECRET/);
		expect(() => withValues({ REDIS_URL: "" })).toThrow(/REDIS_URL/);
	});
});

describe("deploymentEnvProblem", () => {
	const example = "32-characters-or-more-better-auth-secret=";
	it("refuses the example secret in production and staging", () => {
		expect(deploymentEnvProblem({ NODE_ENV: "production", BETTER_AUTH_SECRET: example })).toMatch(
			/example value/,
		);
		expect(deploymentEnvProblem({ NODE_ENV: "staging", BETTER_AUTH_SECRET: example })).toMatch(
			/example value/,
		);
	});
	it("allows it in development and tests, and allows a real secret anywhere", () => {
		expect(
			deploymentEnvProblem({ NODE_ENV: "development", BETTER_AUTH_SECRET: example }),
		).toBeNull();
		expect(
			deploymentEnvProblem({ NODE_ENV: "production", BETTER_AUTH_SECRET: "k".repeat(48) }),
		).toBeNull();
	});
});

describe("cross-variable rules", () => {
	it("refuses a bucket public host under the tenant root", () => {
		expect(() =>
			withValues({ TENANT_ROOT_DOMAIN: "example.com", S3_PUBLIC_URL: "https://cdn.example.com" }),
		).toThrow(/S3_PUBLIC_URL must not be TENANT_ROOT_DOMAIN/);
		expect(() =>
			withValues({ TENANT_ROOT_DOMAIN: "example.com", S3_PUBLIC_URL: "https://example.com/files" }),
		).toThrow(/S3_PUBLIC_URL must not be TENANT_ROOT_DOMAIN/);
		expect(() =>
			withValues({
				TENANT_ROOT_DOMAIN: "example.com",
				S3_PUBLIC_URL: "https://files.example-cdn.net",
			}),
		).not.toThrow();
		// A host that merely ends with the root's letters is another domain.
		expect(() =>
			withValues({ TENANT_ROOT_DOMAIN: "example.com", S3_PUBLIC_URL: "https://notexample.com" }),
		).not.toThrow();
	});
});
