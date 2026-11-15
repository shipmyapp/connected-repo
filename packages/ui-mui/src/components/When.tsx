import { useEffect, useState } from "react";
import { absoluteTime, relativeTime } from "../utils/relative_time";

/**
 * One ticker for every `<When>` on the page: relative times are minutes
 * wide, so a page re-reads the clock once a minute, not once per label.
 */
let now = Date.now();
const listeners = new Set<(t: number) => void>();
let timer: number | null = null;
function subscribe(fn: (t: number) => void) {
	listeners.add(fn);
	if (timer === null) {
		timer = window.setInterval(() => {
			now = Date.now();
			for (const l of listeners) l(now);
		}, 30_000);
	}
	return () => {
		listeners.delete(fn);
		if (listeners.size === 0 && timer !== null) {
			window.clearInterval(timer);
			timer = null;
		}
	};
}

/** "5 min ago", kept current; the exact date and time on hover. */
export function When({ at }: { at: number | null | undefined }) {
	const [, setTick] = useState(now);
	useEffect(() => subscribe(setTick), []);
	if (at === null || at === undefined) return null;
	return (
		<time dateTime={new Date(at).toISOString()} title={absoluteTime(at)}>
			{relativeTime(at, Date.now())}
		</time>
	);
}
