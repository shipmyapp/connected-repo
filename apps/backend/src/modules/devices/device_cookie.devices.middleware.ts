import { randomBytes } from "node:crypto";
import { isProd, isStaging } from "@backend/configs/env.config";
import type { NodeHttpRequest, NodeHttpResponse } from "@orpc/standard-server-node";

/**
 * The device key. Browsers: a random key the server gives every browser the
 * first time it calls the API, in a first-party cookie, read on every request
 * and stamped on sessions. It is a label, never a credential: it authenticates
 * nothing, so it is not signed. A cookie set by the server outlives Safari's
 * seven-day sweep of script-written storage (localStorage and JS cookies), and
 * the app cannot lose it by clearing one of its own keys. An iPhone's Safari and
 * its Home Screen app keep separate jars, so they get two keys; the rules pair
 * them when read (`@connected-repo/zod-schemas/devices/devices.rules`). A team's
 * own host has its own jar, hence its own device rows, which is right:
 * its installed app is another app.
 *
 * Native apps (bearer token, no cookie jar shared with a browser) send their own
 * install id in `x-device-id`; it is namespaced `native-<id>`.
 *
 * Cookie value `<key>.<issued day, base 36>`: the key (128 random bits,
 * base64url, 22 chars) is the device; the day says when to renew it, a month
 * after it was issued, for another 400 days (the longest a browser keeps one).
 */
export const DEVICE_COOKIE = "app_device";
export const DEVICE_HEADER = "x-device-id";

const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RENEW_AFTER_DAYS = 30;
const COOKIE_VALUE = /^([A-Za-z0-9_-]{22})\.([0-9a-z]{1,8})$/;
const NATIVE_ID = /^[A-Za-z0-9_-]{16,57}$/;

/** The paths that carry the device: sign-in (stamped on the session) and the app's own procedures. */
const DEVICE_PATHS = ["/api/auth", "/api/user-app"];

const dayOf = (now: number) => Math.floor(now / MS_PER_DAY);

const parse = (value: string | undefined): { key: string; issuedDay: number } | null => {
	const match = value ? COOKIE_VALUE.exec(value) : null;
	if (!match?.[1] || !match[2]) return null;
	return { key: match[1], issuedDay: Number.parseInt(match[2], 36) };
};

/** The first well-formed device cookie in a `cookie` header (a mangled one is passed over). */
const deviceCookieIn = (cookieHeader: string | null | undefined) => {
	for (const part of (cookieHeader ?? "").split(";")) {
		const [name, ...rest] = part.trim().split("=");
		const parsed = name === DEVICE_COOKIE ? parse(rest.join("=")) : null;
		if (parsed) return parsed;
	}
	return null;
};

/**
 * The device key a request carries: the browser's cookie, else a native app's
 * `x-device-id` (as `native-<id>`), else null (a client with cookies off, an
 * old native build; see `tokenDeviceKey` in the notifications adapter).
 */
export const deviceKeyOf = (headers: Headers): string | null => {
	const fromCookie = deviceCookieIn(headers.get("cookie"))?.key;
	if (fromCookie) return fromCookie;
	const native = headers.get(DEVICE_HEADER)?.trim();
	return native && NATIVE_ID.test(native) ? `native-${native}` : null;
};

const serialise = (key: string, now: number) =>
	[
		`${DEVICE_COOKIE}=${key}.${dayOf(now).toString(36)}`,
		"Path=/",
		`Max-Age=${MAX_AGE_SECONDS}`,
		"HttpOnly",
		"SameSite=Lax",
		...(isProd || isStaging ? ["Secure"] : []),
	].join("; ");

const headerValue = (value: string | string[] | undefined) =>
	Array.isArray(value) ? value.join("; ") : value;

/**
 * Adds the cookie to the response however the handler after this writes its
 * headers: Better Auth sets `set-cookie` with `setHeader` (replacing what was
 * there) and oRPC passes its headers to `writeHead`, so the cookie is added at
 * `writeHead`, the one moment both pass through.
 */
const sendWithResponse = (res: NodeHttpResponse, cookie: string) => {
	const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => NodeHttpResponse;
	const withCookie = (existing: unknown): string[] => {
		const list =
			existing === undefined
				? []
				: Array.isArray(existing)
					? existing.map(String)
					: [String(existing)];
		return list.some((line) => line.startsWith(`${DEVICE_COOKIE}=`)) ? list : [...list, cookie];
	};
	res.writeHead = ((...args: unknown[]) => {
		res.setHeader("set-cookie", withCookie(res.getHeader("set-cookie")));
		const headers = args.find(
			(arg, index) => index > 0 && typeof arg === "object" && arg !== null && !Array.isArray(arg),
		);
		if (headers && typeof headers === "object") {
			const record = headers as Record<string, unknown>;
			const name = Object.keys(record).find((key) => key.toLowerCase() === "set-cookie");
			if (name) record[name] = withCookie(record[name]);
		}
		return writeHead(...args);
	}) as NodeHttpResponse["writeHead"];
};

/**
 * In the main dispatcher, before the auth and oRPC handlers: reads the device
 * cookie, issues it when missing and renews it when a month old. A new key is
 * also written into this request's own `cookie` header, so the sign-in it
 * arrives with (`databaseHooks.session.create.before`) and the procedure it
 * calls read the same key. Bearer calls, preflights and every other path get
 * no cookie.
 */
export function applyDeviceCookie(
	req: NodeHttpRequest,
	res: NodeHttpResponse,
	now = Date.now(),
): string | null {
	const url = req.url ?? "";
	if (req.method === "OPTIONS" || !DEVICE_PATHS.some((path) => url.startsWith(path))) return null;
	const cookieHeader = headerValue(req.headers.cookie);
	const current = deviceCookieIn(cookieHeader);
	if (current) {
		if (dayOf(now) - current.issuedDay >= RENEW_AFTER_DAYS)
			sendWithResponse(res, serialise(current.key, now));
		return current.key;
	}
	if (/^bearer\s+/i.test(headerValue(req.headers.authorization)?.trim() ?? "")) return null;
	const key = randomBytes(16).toString("base64url");
	const pair = `${DEVICE_COOKIE}=${key}.${dayOf(now).toString(36)}`;
	req.headers.cookie = cookieHeader ? `${cookieHeader}; ${pair}` : pair;
	sendWithResponse(res, serialise(key, now));
	return key;
}
