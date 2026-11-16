/**
 * Who tried to install the app and what came of it: which people wanted to
 * install it (especially on iOS) but couldn't, or were put off by the
 * instructions. One record per device (the `devices.install_tries` column):
 * the install dialog shown, the steps opened (the sign that they wanted it),
 * the pictures looked at, the dialog closed, the browser's own dialog answered or failed, and, on an
 * iPhone, their own answer to "what happened?". Only times and counts, never
 * a page or a device id.
 */
import type { InstallBlocker, InstallStep, InstallTry } from "../device.zod.js";

export type { InstallTry };

/** One step, or the answer to the question, as the app reports it. */
export type InstallTryInput = { step: InstallStep } | { step: "answered"; reason: InstallBlocker };

/** The record after one more step. */
export function nextInstallTry(
	current: InstallTry | undefined,
	input: InstallTryInput,
	now: number,
): InstallTry {
	const state: InstallTry = { ...current };
	switch (input.step) {
		case "shown":
			return {
				...state,
				firstShownAt: state.firstShownAt ?? now,
				lastShownAt: now,
				shows: (state.shows ?? 0) + 1,
			};
		case "steps":
			return { ...state, stepsAt: now };
		case "pictures":
			return { ...state, picturesAt: now };
		case "closed":
			return { ...state, closedAt: now };
		case "accepted":
			return { ...state, acceptedAt: now };
		case "failed":
			return { ...state, failedAt: now };
		case "answered":
			return { ...state, blocker: { reason: input.reason, at: now } };
	}
}

/** The steps get this long to work before "what happened?" is asked. */
export const BLOCKER_ASK_AFTER_MS = 60 * 60 * 1000;

/**
 * Whether to ask "what happened?" now: the steps were opened at least an hour
 * ago, the app has not been seen installed or opened from the home screen on
 * this kind of device since, and the question was never answered (or closed).
 * Asked once per account and kind of device; the caller asks only on an
 * iPhone or iPad, outside the installed app.
 */
export function shouldAskInstallBlocker(
	tries: InstallTry | undefined,
	installed: { firstAt: number; lastOpenedAt?: number } | undefined,
	now: number,
): boolean {
	const stepsAt = tries?.stepsAt;
	if (stepsAt === undefined || tries?.blocker) return false;
	if (now - stepsAt < BLOCKER_ASK_AFTER_MS) return false;
	if (installed && Math.max(installed.firstAt, installed.lastOpenedAt ?? 0) >= stepsAt)
		return false;
	return true;
}

/**
 * Wanted the app here and did not get it: opened the steps (or answered the
 * browser's dialog with Install, or saw it fail) and the app was never seen
 * installed on this kind of device afterwards. Who an operator would follow up with.
 */
export function triedWithoutInstall(
	tries: InstallTry | undefined,
	installed: { firstAt: number; lastOpenedAt?: number } | undefined,
): boolean {
	const wantedAt = Math.max(tries?.stepsAt ?? 0, tries?.acceptedAt ?? 0, tries?.failedAt ?? 0);
	if (wantedAt === 0) return false;
	if (tries?.blocker?.reason === "added") return false;
	if (!installed) return true;
	return Math.max(installed.firstAt, installed.lastOpenedAt ?? 0) < wantedAt;
}
