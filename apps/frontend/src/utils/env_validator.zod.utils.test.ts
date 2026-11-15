import { describe, expect, it } from "vitest";
import { envSchemaZod } from "./env_validator.zod.utils";

const validEnv = {
	VITE_USER_NODE_ENV: "test",
	VITE_API_URL: "http://localhost:3001",
	VITE_USER_APP_URL: "http://localhost:5173",
	VITE_OTEL_SERVICE_NAME: "connected-repo-frontend-test",
};

describe("envSchemaZod", () => {
	it("accepts the committed test configuration", () => {
		const parsed = envSchemaZod.parse(validEnv);
		expect(parsed.VITE_USER_NODE_ENV).toBe("test");
		expect(parsed.VITE_API_URL).toBe("http://localhost:3001");
	});

	it("treats an empty API URL as same-origin (undefined)", () => {
		const parsed = envSchemaZod.parse({ ...validEnv, VITE_API_URL: "", VITE_USER_APP_URL: "" });
		expect(parsed.VITE_API_URL).toBeUndefined();
		expect(parsed.VITE_USER_APP_URL).toBeUndefined();
	});

	it("rejects an unknown build mode", () => {
		const result = envSchemaZod.safeParse({ ...validEnv, VITE_USER_NODE_ENV: "qa" });
		expect(result.success).toBe(false);
	});

	it("rejects a malformed API URL", () => {
		const result = envSchemaZod.safeParse({ ...validEnv, VITE_API_URL: "not a url" });
		expect(result.success).toBe(false);
	});

	it("treats blank optional keys as unset (a Docker build arg left empty)", () => {
		const parsed = envSchemaZod.parse({
			...validEnv,
			VITE_TEST_PASSWORD: "",
			VITE_OTEL_SERVICE_NAME: "",
			VITE_SENTRY_DSN: "",
		});
		expect(parsed.VITE_TEST_PASSWORD).toBeUndefined();
		expect(parsed.VITE_OTEL_SERVICE_NAME).toBe("frontend");
		expect(parsed.VITE_SENTRY_DSN).toBeUndefined();
	});

	it("reads a sample rate as a number between 0 and 1", () => {
		expect(
			envSchemaZod.parse({ ...validEnv, VITE_SENTRY_TRACES_SAMPLE_RATE: "0.25" })
				.VITE_SENTRY_TRACES_SAMPLE_RATE,
		).toBe(0.25);
		expect(
			envSchemaZod.safeParse({ ...validEnv, VITE_SENTRY_TRACES_SAMPLE_RATE: "2" }).success,
		).toBe(false);
	});
});
