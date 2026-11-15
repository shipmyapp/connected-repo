import { describe, expect, it } from "vitest";
import { healthBody } from "./health_response.utils";

const health = { status: "ok", timestamp: "2026-01-01T00:00:00.000Z", activeRequests: 3 };
const details = { service: "connected-repo-backend", environment: "production" };

describe("healthBody", () => {
	it("says only status, time and redis outside development", () => {
		expect(
			healthBody(health, { redis: "ok", httpVersion: "1.1" }, { ...details, development: false }),
		).toEqual({
			status: "ok",
			timestamp: "2026-01-01T00:00:00.000Z",
			redis: "ok",
		});
	});
	it("adds the details in development", () => {
		expect(healthBody(health, { redis: "ok" }, { ...details, development: true })).toMatchObject({
			service: "connected-repo-backend",
			activeRequests: 3,
		});
	});
});
