import { describe, expect, it } from "vitest";
import {
	BLOCKER_ASK_AFTER_MS,
	nextInstallTry,
	shouldAskInstallBlocker,
	triedWithoutInstall,
} from "./install_tries.rules";

const HOUR = 60 * 60 * 1000;

describe("nextInstallTry", () => {
	it("counts each showing and keeps the first", () => {
		const once = nextInstallTry(undefined, { step: "shown" }, 100);
		const twice = nextInstallTry(once, { step: "shown" }, 200);
		expect(twice).toEqual({ firstShownAt: 100, lastShownAt: 200, shows: 2 });
	});
	it("stamps the steps, the pictures, the close and the browser's answer", () => {
		let state = nextInstallTry(undefined, { step: "steps" }, 10);
		state = nextInstallTry(state, { step: "pictures" }, 20);
		state = nextInstallTry(state, { step: "closed" }, 30);
		state = nextInstallTry(state, { step: "failed" }, 40);
		expect(state).toEqual({ stepsAt: 10, picturesAt: 20, closedAt: 30, failedAt: 40 });
	});
	it("keeps the person's own answer with its time", () => {
		expect(nextInstallTry({ stepsAt: 1 }, { step: "answered", reason: "couldnt_find" }, 5)).toEqual(
			{
				stepsAt: 1,
				blocker: { reason: "couldnt_find", at: 5 },
			},
		);
	});
});

describe("shouldAskInstallBlocker", () => {
	const stepsAt = 1_000 * HOUR;
	it("asks an hour after the steps were opened, when nothing was installed", () => {
		expect(shouldAskInstallBlocker({ stepsAt }, undefined, stepsAt + BLOCKER_ASK_AFTER_MS)).toBe(
			true,
		);
		expect(
			shouldAskInstallBlocker({ stepsAt }, undefined, stepsAt + BLOCKER_ASK_AFTER_MS - 1),
		).toBe(false);
	});
	it("never asks someone who never opened the steps, or who already answered", () => {
		expect(shouldAskInstallBlocker({ shows: 3 }, undefined, stepsAt * 2)).toBe(false);
		expect(
			shouldAskInstallBlocker(
				{ stepsAt, blocker: { reason: "skipped", at: stepsAt } },
				undefined,
				stepsAt * 2,
			),
		).toBe(false);
	});
	it("does not ask once the app was opened from the home screen after the steps", () => {
		expect(
			shouldAskInstallBlocker({ stepsAt }, { firstAt: stepsAt + HOUR }, stepsAt + 3 * HOUR),
		).toBe(false);
		expect(
			shouldAskInstallBlocker(
				{ stepsAt },
				{ firstAt: 1, lastOpenedAt: stepsAt + 1 },
				stepsAt + 3 * HOUR,
			),
		).toBe(false);
	});
	it("asks when the only install seen is older than the steps (removed and tried again)", () => {
		expect(
			shouldAskInstallBlocker({ stepsAt }, { firstAt: 1, lastOpenedAt: 2 }, stepsAt + 3 * HOUR),
		).toBe(true);
	});
});

describe("triedWithoutInstall", () => {
	it("lists someone who opened the steps and never installed", () => {
		expect(triedWithoutInstall({ stepsAt: 10 }, undefined)).toBe(true);
	});
	it("lists a failed browser install too", () => {
		expect(triedWithoutInstall({ failedAt: 10 }, undefined)).toBe(true);
	});
	it("does not list someone who only saw the dialog", () => {
		expect(triedWithoutInstall({ shows: 4, closedAt: 9 }, undefined)).toBe(false);
	});
	it("does not list someone installed after trying, or who says they added it", () => {
		expect(triedWithoutInstall({ stepsAt: 10 }, { firstAt: 11 })).toBe(false);
		expect(
			triedWithoutInstall({ stepsAt: 10, blocker: { reason: "added", at: 12 } }, undefined),
		).toBe(false);
	});
});
