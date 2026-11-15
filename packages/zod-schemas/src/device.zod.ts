import { z } from "zod";
import { zString, zTimeEpoch } from "./zod_utils.js";

/**
 * The three kinds of device the app is installed on and reports from.
 * Distinct from `devicePlatformZod` in `enums.zod.ts`, which stays as the native
 * apps' push-registration input.
 */
export const APP_PLATFORMS = ["ios", "android", "desktop"] as const;
export const appPlatformZod = z.enum(APP_PLATFORMS);
export type AppPlatform = z.infer<typeof appPlatformZod>;

/**
 * One install try on a device: the dialog shown, the steps opened (the sign
 * that the person wanted it), the pictures looked at, closed, the browser's
 * own dialog accepted or failed.
 */
export const INSTALL_STEPS = [
	"shown",
	"steps",
	"pictures",
	"closed",
	"accepted",
	"failed",
] as const;
export type InstallStep = (typeof INSTALL_STEPS)[number];

/** The answers to "What happened?" on an iPhone; `skipped` is the sheet closed without one. */
export const INSTALL_BLOCKERS = [
	"added",
	"couldnt_find",
	"too_many_steps",
	"prefer_browser",
	"later",
	"skipped",
] as const;
export const installBlockerZod = z.enum(INSTALL_BLOCKERS);
export type InstallBlocker = z.infer<typeof installBlockerZod>;

/** What the browser says about a permission: allowed, blocked, not asked yet, or not available on that device. */
export const devicePermissionZod = z.enum(["granted", "denied", "prompt", "unsupported"]);
export type DevicePermission = z.infer<typeof devicePermissionZod>;

/** Why push stopped on a device. `pruned`: Novu or FCM dropped the address (on an iPhone, the Home Screen app was removed). */
export const PUSH_OFF_REASONS = [
	"switched_off",
	"signed_out",
	"pruned",
	"subscriber_deleted",
	"replaced",
] as const;
export type PushOffReason = (typeof PUSH_OFF_REASONS)[number];

/** One device's install tries (times are epoch ms). Rules: `devices/install_tries.rules.ts`. */
export const installTryZod = z.object({
	firstShownAt: zTimeEpoch.optional(),
	lastShownAt: zTimeEpoch.optional(),
	shows: z.number().int().min(0).optional(),
	stepsAt: zTimeEpoch.optional(),
	picturesAt: zTimeEpoch.optional(),
	closedAt: zTimeEpoch.optional(),
	acceptedAt: zTimeEpoch.optional(),
	failedAt: zTimeEpoch.optional(),
	blocker: z.object({ reason: installBlockerZod, at: zTimeEpoch }).optional(),
});
export type InstallTry = z.infer<typeof installTryZod>;

/**
 * What the app reports about the device in the person's hand (`devices.report`).
 * Every field is optional: a repeated report changes only what it names, and the
 * adapters (`notifications.registerDevice`) report what they know.
 */
export const deviceReportInputZod = z.object({
	/** iPadOS's Safari says it is a Mac; the app's own reading wins over the user agent's. */
	platform: appPlatformZod.optional(),
	/** This page is the installed app (Home Screen, Dock, Chrome's app window). */
	isStandalone: z.boolean().optional(),
	/** The browser knows the app is installed (Chrome's `appinstalled`, `getInstalledRelatedApps`). */
	isInstalled: z.boolean().optional(),
	/** The signature that pairs an iPhone's Safari with its Home Screen app: `"393x852@3"`. */
	screen: z
		.string()
		.regex(/^\d{2,5}x\d{2,5}@\d(\.\d{1,2})?$/)
		.optional(),
	timeZone: zString.max(64).optional(),
	language: zString.max(35).optional(),
	pushPermission: devicePermissionZod.optional(),
	/** Push is on here for this account: the device's FCM address. */
	fcmToken: zString.min(1).max(4096).optional(),
});
export type DeviceReportInput = z.infer<typeof deviceReportInputZod>;

/** One step of an install try on this device, or the answer to "what happened?". */
export const deviceInstallTryInputZod = z
	.object({
		step: z.enum([...INSTALL_STEPS, "answered"]),
		reason: installBlockerZod.optional(),
	})
	.refine((input) => (input.step === "answered") === (input.reason !== undefined), {
		message: "A reason goes with an answer, and only with an answer",
	});
export type DeviceInstallTryInput = z.infer<typeof deviceInstallTryInputZod>;

/** Push stopped on this device: switched off by the person, or signing out. */
export const devicePushOffInputZod = z.object({
	reason: z.enum(["switched_off", "signed_out"]),
	/** The address the app last used, for a device whose key went missing. */
	fcmToken: zString.min(1).max(4096).optional(),
});
export type DevicePushOffInput = z.infer<typeof devicePushOffInputZod>;

/** What the device in the person's hand may be offered (`devices.here`). `known: false` when no device key or no row yet. */
export const deviceHereZod = z.object({
	known: z.boolean(),
	platform: appPlatformZod.nullable(),
	browser: zString.nullable(),
	model: zString.nullable(),
	os: zString.nullable(),
	isStandalone: z.boolean(),
	installedHere: z.boolean(),
	probablyUninstalled: z.boolean(),
	pushHere: z.boolean(),
	pushPermission: devicePermissionZod.nullable(),
	installTries: installTryZod.nullable(),
	/** The automatic install offer may show here now (48 hours after it was last shown or closed). */
	installOfferDue: z.boolean(),
	/** Ask "what happened?" on this iPhone now. */
	askInstallBlocker: z.boolean(),
});
export type DeviceHere = z.infer<typeof deviceHereZod>;

/** The device asks. Rules: `devices/asks.rules.ts`. A project adds its own kinds here. */
export const ASK_KINDS = ["push", "install"] as const;
export const askKindZod = z.enum(ASK_KINDS);
export type AskKind = z.infer<typeof askKindZod>;
export const askStateZod = z.object({
	snoozedUntil: zTimeEpoch.optional(),
	snoozes: z.number().int().min(0).optional(),
	grantedAt: zTimeEpoch.optional(),
	deniedAt: zTimeEpoch.optional(),
	pendingInstallSince: zTimeEpoch.optional(),
});
export const asksZod = z.partialRecord(askKindZod, askStateZod);
export type Asks = z.infer<typeof asksZod>;
export const askOutcomeZod = z.enum(["snoozed", "granted", "denied", "pending_install"]);
export type AskOutcome = z.infer<typeof askOutcomeZod>;
export const recordAskInputZod = z.object({ kind: askKindZod, outcome: askOutcomeZod });
export type RecordAskInput = z.infer<typeof recordAskInputZod>;
