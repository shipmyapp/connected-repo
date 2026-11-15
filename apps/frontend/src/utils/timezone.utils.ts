import { isIanaTimeZone } from "@connected-repo/zod-schemas/zod_utils";

/**
 * The device's IANA time zone, or null when the browser cannot name one the
 * backend accepts (zTimezone refuses anything Intl cannot use). No network
 * lookup: an IP service would be a third party seeing every visitor, and
 * over http it is blocked on an https page anyway.
 */
export function detectUserTimezone(): string | null {
	try {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return zone && isIanaTimeZone(zone) ? zone : null;
	} catch {
		return null;
	}
}
