import { describe, expect, it } from "vitest";
import { chunk } from "./promise.utils";

describe("chunk", () => {
	it("splits into slices of at most size items", () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunk([], 20)).toEqual([]);
	});
});
