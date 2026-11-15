import { z } from "zod";

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
