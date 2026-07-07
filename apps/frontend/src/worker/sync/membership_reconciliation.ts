/**
 * Pure membership-reconciliation logic, split out so it can be unit-tested
 * without the worker/Dexie import graph.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ Q6 fix — how revocation now propagates even when it hits the 403 wall. │
 * └───────────────────────────────────────────────────────────────────────┘
 * The old design tried to learn "you were removed from team X" by PULLING the
 * user's own tombstoned `team_members` row. But every sync RPC (including the
 * wave-1 anchor) requires an active membership in the active team, so a user
 * removed from their active team got 403 on everything and could never pull
 * the tombstone — the device kept the team's data forever, and a re-invite
 * could trigger an endless wipe/re-pull loop.
 *
 * The fix reconciles against CURRENT state instead of a tombstone: a
 * session-only endpoint (`teams.listMyActiveTeamIds`) returns the teams the
 * user is actively a member of right now. The client wipes any team it has
 * mirrored locally that is no longer in that set. This works regardless of
 * which team is active (session-only ⇒ no 403), and it cannot loop — a
 * re-invited user is back in the active set, so nothing gets wiped.
 */
export function teamsToWipeFromReconciliation(
	activeMembershipTeamIds: readonly string[],
	localTeamIds: readonly string[],
): string[] {
	const active = new Set(activeMembershipTeamIds);
	return localTeamIds.filter((id) => !active.has(id));
}
