import { describe, expect, it } from "vitest";
import { teamsToWipeFromReconciliation } from "./membership_reconciliation";

describe("teamsToWipeFromReconciliation (Q6)", () => {
	it("wipes local teams that are no longer in the active-membership set", () => {
		// User was removed from team "c" — it's still mirrored locally but no
		// longer an active membership, so it must be wiped.
		expect(teamsToWipeFromReconciliation(["a", "b"], ["a", "b", "c"])).toEqual(["c"]);
	});

	it("wipes nothing when every local team is still an active membership", () => {
		expect(teamsToWipeFromReconciliation(["a", "b", "c"], ["a", "b"])).toEqual([]);
	});

	it("does not loop on re-invite: a re-added team is in the active set again", () => {
		// After re-invite "c" is back in the active set, so it is NOT wiped —
		// the old tombstone-pull design would have wiped-then-repulled forever.
		expect(teamsToWipeFromReconciliation(["a", "b", "c"], ["a", "b", "c"])).toEqual([]);
	});

	it("wipes all local teams when the active set is empty", () => {
		expect(teamsToWipeFromReconciliation([], ["a", "b"])).toEqual(["a", "b"]);
	});

	it("returns nothing when there is no local data yet", () => {
		expect(teamsToWipeFromReconciliation(["a"], [])).toEqual([]);
	});
});
