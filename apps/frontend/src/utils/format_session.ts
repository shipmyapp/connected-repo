import type { AccountSession } from "@connected-repo/zod-schemas/account.zod";

/** "Chrome on macOS", "Safari on iOS · iPhone", or "Unknown device". */
export function describeSession(s: Pick<AccountSession, "browser" | "os" | "device">): string {
	const main = [s.browser, s.os].filter(Boolean).join(" on ");
	const device = s.device && !main.includes(s.device) ? s.device : null;
	return [main, device].filter(Boolean).join(" · ") || "Unknown device";
}
