import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { db } from "@backend/db/db";
import { auth } from "@backend/modules/auth/auth.config";
import { devicesRouter } from "@backend/modules/devices/devices.router";
import { notificationsRouter } from "@backend/modules/notifications/notifications.router";
import { reconcileUserFcmDevices } from "@backend/modules/notifications/services/reconcile_devices.notifications.service";
import { defaultContext } from "@backend/test/setup";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { INSTALL_OFFER_EVERY_MS } from "@connected-repo/zod-schemas/devices/devices.rules";
import { createRouterClient } from "@orpc/server";
import { ulid } from "ulid";
import { describe, expect, it } from "vitest";
import {
	applyDeviceCookie,
	DEVICE_COOKIE,
	DEVICE_HEADER,
	deviceKeyOf,
} from "./device_cookie.devices.middleware";
import { deviceStateFor } from "./services/device_state.devices.service";
import { reportDevice } from "./services/report.devices.service";

const IPHONE_SAFARI =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1";
const IPHONE_APP =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const SIGNATURE = { screen: "393x852@3", timeZone: "Asia/Kolkata", language: "en-IN" };
const DAY = 24 * 60 * 60 * 1000;

const requireContext = () => {
	if (!defaultContext) throw new Error("defaultContext not initialized");
	return defaultContext;
};

/** A key in the cookie's own shape (22 base64url characters). */
const newKey = () => ulid().slice(0, 22);

/** The signed-in test person's headers, from a given device and browser. */
const headersFor = (headers: Headers, key: string | null, agent = IPHONE_SAFARI) => {
	const next = new Headers(headers);
	if (key) next.set("cookie", `${headers.get("cookie") ?? ""}; ${DEVICE_COOKIE}=${key}.0`);
	next.set("user-agent", agent);
	return next;
};

const clientFor = (key: string | null, agent = IPHONE_SAFARI) => {
	const ctx = requireContext();
	return createRouterClient(devicesRouter, {
		context: { ...ctx, reqHeaders: headersFor(ctx.reqHeaders, key, agent) },
	});
};

const exchange = (url: string, headers: Record<string, string> = {}) => {
	const req = new IncomingMessage(new Socket());
	req.url = url;
	req.headers = headers;
	const res = new ServerResponse(req);
	return { req, res };
};

const setCookies = (res: ServerResponse) => {
	const value = res.getHeader("set-cookie");
	return Array.isArray(value) ? value : value === undefined ? [] : [String(value)];
};

describe("the device cookie", () => {
	it("is issued on the app's calls, kept, and written into the request itself", () => {
		const { req, res } = exchange("/api/user-app/devices/here");
		const key = applyDeviceCookie(req, res);
		expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(deviceKeyOf(new Headers({ cookie: String(req.headers.cookie) }))).toBe(key);
		res.writeHead(200);
		const [cookie] = setCookies(res);
		expect(cookie).toContain(`${DEVICE_COOKIE}=${key}.`);
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain(`Max-Age=${400 * 24 * 60 * 60}`);
	});

	it("survives a handler that replaces set-cookie, and one that passes it to writeHead", () => {
		const { req, res } = exchange("/api/auth/sign-in/email");
		const key = applyDeviceCookie(req, res);
		res.setHeader("set-cookie", ["session=abc"]);
		res.writeHead(200, { "set-cookie": ["other=1"] });
		const sent = setCookies(res).join("\n");
		expect(sent).toContain("other=1");
		expect(sent).toContain(`${DEVICE_COOKIE}=${key}.`);
	});

	it("is kept as it is, then renewed with the same key when a month old", () => {
		const now = Date.now();
		const today = Math.floor(now / DAY).toString(36);
		const fresh = exchange("/api/user-app/x", {
			cookie: `${DEVICE_COOKIE}=${"a".repeat(22)}.${today}`,
		});
		expect(applyDeviceCookie(fresh.req, fresh.res, now)).toBe("a".repeat(22));
		fresh.res.writeHead(200);
		expect(setCookies(fresh.res)).toEqual([]);

		const old = exchange("/api/user-app/x", {
			cookie: `${DEVICE_COOKIE}=${"b".repeat(22)}.${(Math.floor(now / DAY) - 31).toString(36)}`,
		});
		expect(applyDeviceCookie(old.req, old.res, now)).toBe("b".repeat(22));
		old.res.writeHead(200);
		expect(setCookies(old.res)[0]).toContain(`${DEVICE_COOKIE}=${"b".repeat(22)}.${today}`);
	});

	it("is not given to bearer calls, nor outside sign-in and the app's procedures", () => {
		const bearer = exchange("/api/user-app/x", { authorization: "Bearer abc" });
		expect(applyDeviceCookie(bearer.req, bearer.res)).toBeNull();
		const media = exchange("/media/token");
		expect(applyDeviceCookie(media.req, media.res)).toBeNull();
		media.res.writeHead(200);
		expect(setCookies(media.res)).toEqual([]);
	});

	it("is stamped on the session a sign-in opens", async () => {
		const email = `device-${ulid()}@example.com`;
		const { user } = await auth.api.signUpEmail({
			body: { email, password: "password123", name: "Device Person", journalReminderTimes: [] },
		});
		const key = newKey();
		const response = await auth.api.signInEmail({
			body: { email, password: "password123" },
			headers: new Headers({ cookie: `${DEVICE_COOKIE}=${key}.0` }),
			asResponse: true,
		});
		expect(response.ok).toBe(true);
		// The sign-up opened a session of its own, without a cookie.
		expect(await db.sessions.where({ userId: user.id }).pluck("deviceKey")).toEqual(
			expect.arrayContaining([null, key]),
		);
	});
	it("records what the user agent says on the session a sign-in opens", async () => {
		const email = `agent-${ulid()}@example.com`;
		const { user } = await auth.api.signUpEmail({
			body: { email, password: "password123", name: "Agent Person", journalReminderTimes: [] },
		});
		const androidChrome =
			"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
		await auth.api.signInEmail({
			body: { email, password: "password123" },
			headers: new Headers({
				"user-agent": androidChrome,
				cookie: `${DEVICE_COOKIE}=${newKey()}.0`,
			}),
		});
		const [opened] = await db.sessions
			.where({ userId: user.id, deviceKey: { not: null } })
			.select("browser", "os", "device", "deviceFingerprint");
		expect(opened).toMatchObject({
			browser: "Mobile Chrome",
			os: "Android",
			deviceFingerprint: null,
		});
		expect(opened?.device).not.toBeNull();
	});
});

describe("devices.report and devices.here", () => {
	it("makes one row per device, refreshes it, and keeps the first install", async () => {
		const ctx = requireContext();
		const key = newKey();
		const client = clientFor(key, IPHONE_APP);
		await client.report({ ...SIGNATURE, isStandalone: true, pushPermission: "prompt" });
		const first = await db.devices.where({ userId: ctx.user.id, deviceKey: key }).take();
		expect(first).toMatchObject({
			platform: "ios",
			os: "iOS",
			osVersion: "17.4.1",
			isStandalone: true,
			...SIGNATURE,
		});
		expect(first.installedAt).not.toBeNull();
		await client.report({ pushPermission: "granted" });
		const rows = await db.devices.where({ userId: ctx.user.id }).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ installedAt: first.installedAt, pushPermission: "granted" });
	});

	it("pairs an iPhone's Safari with its own Home Screen app, and not a second iPhone's", async () => {
		const safari = newKey();
		await clientFor(safari).report({ ...SIGNATURE });
		expect((await clientFor(safari).here()).installedHere).toBe(false);
		await clientFor(newKey(), IPHONE_APP).report({ ...SIGNATURE, isStandalone: true });
		expect(await clientFor(safari).here()).toMatchObject({
			known: true,
			installedHere: true,
			installOfferDue: false,
		});
		// A second identical iPhone with the app: two match, so none does, and the offer shows.
		await clientFor(newKey(), IPHONE_APP).report({ ...SIGNATURE, isStandalone: true });
		expect(await clientFor(safari).here()).toMatchObject({
			installedHere: false,
			installOfferDue: true,
		});
	});

	it("offers the install again 48 hours after it was last shown or closed here", async () => {
		const ctx = requireContext();
		const key = newKey();
		await clientFor(key).recordInstallTry({ step: "shown" });
		expect((await clientFor(key).here()).installOfferDue).toBe(false);
		expect(
			(await deviceStateFor(ctx.user.id, key, Date.now() + INSTALL_OFFER_EVERY_MS)).installOfferDue,
		).toBe(true);
		// Another device of the account was never offered.
		expect((await clientFor(newKey()).here()).installOfferDue).toBe(true);
	});

	it("asks what happened on an iPhone an hour after the steps, once", async () => {
		const ctx = requireContext();
		const key = newKey();
		await clientFor(key).recordInstallTry({ step: "steps" });
		expect((await clientFor(key).here()).askInstallBlocker).toBe(false);
		expect(
			(await deviceStateFor(ctx.user.id, key, Date.now() + 2 * 60 * 60 * 1000)).askInstallBlocker,
		).toBe(true);
		await clientFor(key).recordInstallTry({ step: "answered", reason: "skipped" });
		expect(
			(await deviceStateFor(ctx.user.id, key, Date.now() + 2 * 60 * 60 * 1000)).askInstallBlocker,
		).toBe(false);
	});

	it("knows nothing without the cookie, and records nothing", async () => {
		const ctx = requireContext();
		const client = clientFor(null);
		await client.report({ isStandalone: true });
		expect(await client.here()).toMatchObject({
			known: false,
			installedHere: false,
			pushHere: false,
		});
		expect(await db.devices.where({ userId: ctx.user.id }).exists()).toBe(false);
	});
});

describe("push on a device", () => {
	it("is on here with an address, and off after devices.pushOff", async () => {
		const key = newKey();
		const client = clientFor(key);
		await client.report({ fcmToken: `t_${ulid()}` });
		expect((await client.here()).pushHere).toBe(true);
		await client.pushOff({ reason: "switched_off" });
		const state = await client.here();
		expect(state.pushHere).toBe(false);
		const ctx = requireContext();
		expect(
			await db.devices.where({ userId: ctx.user.id, deviceKey: key }).pluck("pushOffReason"),
		).toEqual(["switched_off"]);
	});

	it("moves the address to the account now signed in on that phone", async () => {
		const ctx = requireContext();
		const token = `t_${ulid()}`;
		const key = newKey();
		await reportDevice({
			userId: ctx.user.id,
			deviceKey: key,
			report: { fcmToken: token },
			headers: new Headers(),
		});
		const next = await createUserAndLogin({ email: `next-${ulid()}@example.com` });
		await reportDevice({
			userId: next.user.id,
			deviceKey: key,
			report: { fcmToken: token },
			headers: new Headers(),
		});
		const live = await db.devices.where({ fcmToken: token, pushOffAt: null }).pluck("userId");
		expect(live).toEqual([next.user.id]);
		expect(
			await db.devices.where({ userId: ctx.user.id, fcmToken: token }).pluck("pushOffReason"),
		).toEqual(["replaced"]);
	});

	it("takes over the address of a row copied from push_devices", async () => {
		const ctx = requireContext();
		const token = `t_${ulid()}`;
		const now = Date.now();
		await db.devices.create({
			id: ulid(),
			userId: ctx.user.id,
			deviceKey: `legacy-${ulid()}`,
			platform: "ios",
			fcmToken: token,
			firstSeenAt: now,
			lastSeenAt: now,
		});
		await clientFor(newKey()).report({ fcmToken: token });
		const rows = await db.devices
			.where({ userId: ctx.user.id, fcmToken: token })
			.select("deviceKey", "pushOffReason")
			.all();
		expect(rows.find((row) => row.deviceKey.startsWith("legacy-"))?.pushOffReason).toBe("replaced");
		expect(rows.find((row) => !row.deviceKey.startsWith("legacy-"))?.pushOffReason).toBeNull();
	});

	it("leaves the reconcile a no-op without Novu", async () => {
		const ctx = requireContext();
		expect(await reconcileUserFcmDevices(ctx.user.id)).toEqual({ pruned: 0 });
	});
});

describe("notifications.registerDevice / revokeDevice, as adapters", () => {
	const notificationsFor = (headers: Headers) => {
		const ctx = requireContext();
		return createRouterClient(notificationsRouter, { context: { ...ctx, reqHeaders: headers } });
	};

	it("records the browser's device under its cookie", async () => {
		const ctx = requireContext();
		const key = newKey();
		const token = `t_${ulid()}`;
		await notificationsFor(headersFor(ctx.reqHeaders, key)).registerDevice({
			fcmToken: token,
			platform: "ios",
			pwaStandaloneLaunch: true,
		});
		const row = await db.devices.where({ userId: ctx.user.id, deviceKey: key }).take();
		expect(row).toMatchObject({
			platform: "ios",
			isStandalone: true,
			fcmToken: token,
			pushPermission: "granted",
			pushOffAt: null,
		});
	});

	it("keys a native client by x-device-id, or by its push address without one", async () => {
		const ctx = requireContext();
		const native = new Headers(ctx.reqHeaders);
		native.set(DEVICE_HEADER, "native-install-0001");
		await notificationsFor(native).registerDevice({ fcmToken: `t_${ulid()}`, platform: "android" });
		expect(
			await db.devices
				.where({ userId: ctx.user.id, deviceKey: "native-native-install-0001" })
				.exists(),
		).toBe(true);
		const token = `t_${ulid()}`;
		await notificationsFor(new Headers(ctx.reqHeaders)).registerDevice({
			fcmToken: token,
			platform: "android",
		});
		const keyed = await db.devices
			.where({ userId: ctx.user.id, fcmToken: token })
			.pluck("deviceKey");
		expect(keyed[0]).toMatch(/^token-[A-Za-z0-9_-]{43}$/);
	});

	it("revokeDevice turns this address off on this account", async () => {
		const ctx = requireContext();
		const key = newKey();
		const token = `t_${ulid()}`;
		const client = notificationsFor(headersFor(ctx.reqHeaders, key));
		await client.registerDevice({ fcmToken: token });
		await client.revokeDevice({ fcmToken: token });
		expect(
			await db.devices.where({ userId: ctx.user.id, deviceKey: key }).pluck("pushOffReason"),
		).toEqual(["switched_off"]);
	});
});
