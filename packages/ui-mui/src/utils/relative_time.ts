import dayjs from "dayjs";

/**
 * When something happened (or will), the way a person says it: "just now",
 * "5 min ago", "2 hours ago", "yesterday, 14:05", "Tue, 09:30", "12 Oct",
 * and the same forwards for a planned time ("in 20 min", "tomorrow, 10:00").
 * Past a week the date itself is clearer than a count of days. The exact
 * moment is always one hover away (`absoluteTime`), so nothing is lost.
 *
 * Positions inside a call (a transcript line's clock) are not this: they
 * place a line in a recording and stay exact.
 */
export function relativeTime(at: number, now: number = Date.now()): string {
	const diff = at - now;
	const future = diff > 0;
	const ms = Math.abs(diff);
	const min = Math.round(ms / 60_000);
	const then = dayjs(at);
	const today = dayjs(now).startOf("day");
	const dayOffset = then.startOf("day").diff(today, "day");

	if (ms < 45_000) return future ? "in a moment" : "just now";
	if (min < 60) return future ? `in ${min} min` : `${min} min ago`;
	if (min < 6 * 60 || dayOffset === 0) {
		const hours = Math.max(1, Math.round(min / 60));
		const unit = hours === 1 ? "hour" : "hours";
		return future ? `in ${hours} ${unit}` : `${hours} ${unit} ago`;
	}
	if (dayOffset === -1) return `yesterday, ${then.format("HH:mm")}`;
	if (dayOffset === 1) return `tomorrow, ${then.format("HH:mm")}`;
	if (Math.abs(dayOffset) < 7) return then.format("ddd, HH:mm");
	return then.year() === dayjs(now).year() ? then.format("D MMM") : then.format("D MMM YYYY");
}

/** The exact moment, for the tooltip and for screen readers. */
export const absoluteTime = (at: number): string => dayjs(at).format("ddd D MMM YYYY, HH:mm");
