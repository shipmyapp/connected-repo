import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative_time";

const NOW = new Date(2026, 9, 25, 15, 0, 0).getTime();
const ago = (ms: number) => NOW - ms;
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("relativeTime", () => {
	it("counts minutes, then hours, then names the day", () => {
		expect(relativeTime(ago(10_000), NOW)).toBe("just now");
		expect(relativeTime(ago(5 * MIN), NOW)).toBe("5 min ago");
		expect(relativeTime(ago(2 * HOUR), NOW)).toBe("2 hours ago");
		expect(relativeTime(ago(1 * HOUR), NOW)).toBe("1 hour ago");
		expect(relativeTime(new Date(2026, 9, 24, 14, 5).getTime(), NOW)).toBe("yesterday, 14:05");
		expect(relativeTime(new Date(2026, 9, 21, 9, 30).getTime(), NOW)).toBe("Wed, 09:30");
		expect(relativeTime(new Date(2026, 9, 2).getTime(), NOW)).toBe("2 Oct");
		expect(relativeTime(new Date(2025, 9, 2).getTime(), NOW)).toBe("2 Oct 2025");
	});

	it("says a planned time forwards", () => {
		expect(relativeTime(NOW + 20 * MIN, NOW)).toBe("in 20 min");
		expect(relativeTime(NOW + 3 * HOUR, NOW)).toBe("in 3 hours");
		expect(relativeTime(new Date(2026, 9, 26, 10, 0).getTime(), NOW)).toBe("tomorrow, 10:00");
	});
});
