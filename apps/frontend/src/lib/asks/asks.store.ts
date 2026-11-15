import {
	type AskKind,
	type AskOutcome,
	type Asks,
	mayAsk,
	nextAskState,
} from "@connected-repo/zod-schemas/devices/asks.rules";
import { fetchDeviceHere } from "@frontend/lib/device/use-device-here";
import { orpcFetch } from "@frontend/utils/orpc.client";
import { create } from "zustand";

/**
 * What the person answered to each device ask, read from the account once per
 * visit (`me.asks`) and kept in step as they answer ("Not now" holds
 * for a while, then the ask comes back; the same on every device). Whether it is
 * granted is THIS device's (`devices.here`). Writes go to the account in the
 * background; a failure leaves the visit's own answer in place, so nothing asks
 * twice. Memory only: nothing in localStorage or Dexie.
 */
type AsksStore = {
	asks: Asks | null;
	/** Asked already in this visit, whatever the answer. */
	shownThisVisit: Partial<Record<AskKind, true>>;
	loading: Promise<Asks> | null;
	ensureLoaded: () => Promise<Asks>;
	markShown: (kind: AskKind) => void;
	record: (kind: AskKind, outcome: AskOutcome) => Promise<void>;
	/** For sign-out: the next account starts clean. */
	reset: () => void;
};

export const useAsksStore = create<AsksStore>((set, get) => ({
	asks: null,
	shownThisVisit: {},
	loading: null,
	ensureLoaded: () => {
		const { asks, loading } = get();
		if (asks) return Promise.resolve(asks);
		if (loading) return loading;
		const pending = orpcFetch.me
			.asks()
			.then((loaded) => {
				set({ asks: loaded, loading: null });
				return loaded;
			})
			.catch(() => {
				// Unknown: ask as if never asked, but only once this visit.
				set({ asks: {}, loading: null });
				return {} as Asks;
			});
		set({ loading: pending });
		return pending;
	},
	markShown: (kind) =>
		set((state) => ({ shownThisVisit: { ...state.shownThisVisit, [kind]: true } })),
	record: async (kind, outcome) => {
		const now = Date.now();
		set((state) => ({
			asks: { ...state.asks, [kind]: nextAskState(state.asks?.[kind], outcome, now) },
			shownThisVisit: { ...state.shownThisVisit, [kind]: true },
		}));
		try {
			const { asks } = await orpcFetch.me.recordAsk({ kind, outcome });
			// The account's word on every ask it knows; what it does not name keeps this visit's answer.
			set((state) => ({ asks: { ...state.asks, ...asks } }));
		} catch {
			// Kept for this visit only; the account is told next time.
		}
	},
	reset: () => set({ asks: null, shownThisVisit: {}, loading: null }),
}));

/** Granted is a fact of this device: push on here for this account, the app installed here. */
const isGrantedHere = async (kind: AskKind): Promise<boolean> => {
	const here = await fetchDeviceHere();
	if (!here) return false;
	return kind === "push" ? here.pushHere : here.installedHere;
};

/**
 * Whether this ask may show now: online (offline nothing is asked: neither a
 * permission prompt nor the install dialog can complete), loaded, not snoozed
 * (the person's Not now), not granted here, not shown this visit.
 */
export const mayAskNow = async (kind: AskKind): Promise<boolean> => {
	if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
	const [asks, grantedHere] = await Promise.all([
		useAsksStore.getState().ensureLoaded(),
		isGrantedHere(kind),
	]);
	return mayAsk(
		asks[kind],
		Date.now(),
		useAsksStore.getState().shownThisVisit[kind] === true,
		grantedHere,
	);
};
