/**
 * The device asks (push, installing the app) and when to ask again (the rule:
 * "Not now" never dismisses for ever; ask again after a defined time, without
 * troubling people). One rule for every ask; Not now is kept per account so a
 * phone and a computer agree, granted per device (`devices.here`).
 */
import type { AskKind } from "../device.zod.js";
export type { AskKind };

/** How long "Not now" holds, by how many times it was said: 3, 7, 14, then 30 days. */
export const ASK_SNOOZE_DAYS = [3, 7, 14, 30] as const;
/** A refusal in the browser's own prompt can only be undone in its settings: asked again rarely. */
export const ASK_DENIED_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type AskOutcome = "snoozed" | "granted" | "denied" | "pending_install";

export interface AskState {
	/** Until when the ask stays quiet. */
	snoozedUntil?: number;
	/** How many times Not now was said. */
	snoozes?: number;
	grantedAt?: number;
	/** The browser refused: only the settings steps help. */
	deniedAt?: number;
	/** The ask waits for the app to be installed (iPhone push); finished on the first open from the home screen. */
	pendingInstallSince?: number;
}

export type Asks = Partial<Record<AskKind, AskState>>;

export const snoozeDaysFor = (snoozes: number): number =>
	ASK_SNOOZE_DAYS[Math.min(Math.max(snoozes, 0), ASK_SNOOZE_DAYS.length - 1)] ?? 30;

export const isAskSnoozed = (state: AskState | undefined, now: number): boolean =>
	typeof state?.snoozedUntil === "number" && state.snoozedUntil > now;

/** The state after an answer: the snooze ladder, a grant that clears it, a refusal that quiets it for a month. */
export const nextAskState = (
	state: AskState | undefined,
	outcome: AskOutcome,
	now: number,
): AskState => {
	const current = state ?? {};
	switch (outcome) {
		case "snoozed": {
			const snoozes = (current.snoozes ?? 0) + 1;
			return { ...current, snoozes, snoozedUntil: now + snoozeDaysFor(snoozes - 1) * MS_PER_DAY };
		}
		case "granted": {
			const {
				snoozedUntil: _quiet,
				pendingInstallSince: _pending,
				deniedAt: _denied,
				...rest
			} = current;
			return { ...rest, grantedAt: now };
		}
		case "denied":
			return { ...current, deniedAt: now, snoozedUntil: now + ASK_DENIED_DAYS * MS_PER_DAY };
		case "pending_install":
			return { ...current, pendingInstallSince: now };
	}
};

/**
 * Whether to ask now: not while it is snoozed, and at most once a visit
 * (`shownThisVisit`). Granted is a fact of one device: push on here, the
 * app installed here (`devices.here`), so a yes on one phone no longer stops the ask on
 * another. Not now stays the person's, so they are not asked on every phone.
 * The account's `grantedAt` is the person's own yes, read before a
 * phone's permission is used, never here.
 */
export const mayAsk = (
	state: AskState | undefined,
	now: number,
	shownThisVisit: boolean,
	grantedHere: boolean,
): boolean => !shownThisVisit && !grantedHere && !isAskSnoozed(state, now);
