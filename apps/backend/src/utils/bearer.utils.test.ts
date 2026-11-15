import { describe, expect, it } from "vitest";
import { isBearerOnlyRequest } from "./bearer.utils";

describe("isBearerOnlyRequest", () => {
	it("is true for a bearer request without cookies only", () => {
		expect(isBearerOnlyRequest(new Headers({ authorization: "Bearer abc.def" }))).toBe(true);
		expect(
			isBearerOnlyRequest(new Headers({ authorization: "Bearer abc.def", cookie: "a=b" })),
		).toBe(false);
		expect(isBearerOnlyRequest(new Headers({ authorization: "Bearer " }))).toBe(false);
		expect(isBearerOnlyRequest(new Headers())).toBe(false);
	});
});
