import { useDeviceReport } from "@frontend/lib/device/use-device-report";
import { getTenantSlug } from "@frontend/tenant/tenant.resolver";
import {
	ACTIVE_TEAM_WIPED_CHANNEL,
	type ActiveTeamWipedMessage,
} from "@frontend/utils/active_team_wiped.channel";
import { patchAuthCacheUser } from "@frontend/utils/auth.persistence";
import type { UserAppBackendOutputs } from "@frontend/utils/orpc.client";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { bindPushAccount, syncPushIfGranted } from "@frontend/utils/push.utils";
import { requestFreshSession } from "@frontend/utils/session_refresh.client";
import { signout } from "@frontend/utils/signout.utils";
import { switchGate } from "@frontend/utils/switch_gate";
import { initSyncForUser, setActiveTeam as syncSetActiveTeam } from "@frontend/utils/sync-triggers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { useRevalidator } from "react-router";
import { toast } from "react-toastify";
import type { SessionInfo } from "./UserContext";

type Team = UserAppBackendOutputs["teams"]["getMyTeams"][number];

// Kept for backwards compatibility with existing consumers. Every user
// always has an active team (personal on signup), so `activeWorkspace` is
// never undefined once the session is loaded.
interface Workspace {
	id: string;
	name: string;
	// A workspace is "personal" iff it is the user's personal team on the
	// server (row where personalTeamForUserId === user.id).
	type: "personal" | "team";
	role: Team["userRole"];
}

interface WorkspaceContextType {
	activeWorkspace: Workspace;
	teams: Team[];
	isLoading: boolean;
	user: SessionInfo["user"];
	setActiveTeam: (teamAppId: string) => Promise<void>;
	isSwitching: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

interface WorkspaceProviderProps {
	children: ReactNode;
	sessionInfo?: SessionInfo | null;
}

// Fallback for the brief window between mount and getMyTeams resolving.
// Renders as a neutral chip; nothing team-scoped is fetched until teams
// arrive because the `x-team-id` header cache is empty.
const PLACEHOLDER_WORKSPACE: Workspace = {
	id: "",
	name: "Loading…",
	type: "personal",
	role: "Owner",
};

export function WorkspaceProvider({ children, sessionInfo }: WorkspaceProviderProps) {
	const queryClient = useQueryClient();
	const revalidator = useRevalidator();
	const userId = sessionInfo?.user?.id;
	const activeTeamAppId = sessionInfo?.user?.activeTeamAppId ?? null;

	const { data: teams = [], isLoading } = useQuery({
		...orpc.teams.getMyTeams.queryOptions({}),
		enabled: !!userId,
	});

	// Push the initial header + worker cache once the session is known.
	// `initSyncForUser` is idempotent for the same userId so re-runs are safe.
	//
	// Dep-list is load-bearing:
	//   - `userId` change → wipe + reopen per-user Dexie DB.
	//   - `activeTeamAppId` change → re-seed the RPC `x-team-id` header +
	//     worker cache atomically, then kick a new sync cycle.
	// The `authLoader` `getDefaultTeam` self-heal mutates `session.user.
	// activeTeamAppId` in place BEFORE this component mounts, so the
	// initial render sees the resolved value in a single tick and this
	// effect fires exactly once at bootup. Adding/removing deps here
	// changes those invariants — double-check before touching.
	useEffect(() => {
		if (!userId) return;
		void initSyncForUser(userId, activeTeamAppId);
	}, [userId, activeTeamAppId]);

	// Silent FCM registration on login. NEVER prompts for permission —
	// browsers permanently disable Notification.requestPermission() for
	// the origin if the user dismisses a bad prompt once. The user-gesture
	// version (promptAndRegisterPush) lives behind explicit UI: the
	// post-first-entry modal, the profile toggle, or the dashboard banner.
	// The device record: what this device is and can do, reported on start,
	// on return to the front, on a permission change and on reconnect.
	useDeviceReport(userId ?? null);
	useEffect(() => {
		if (!userId) return;
		bindPushAccount(userId);
		void syncPushIfGranted();
		// Started offline: register once the connection is back (the token needs the network).
		const onOnline = () => void syncPushIfGranted();
		window.addEventListener("online", onOnline);
		return () => window.removeEventListener("online", onOnline);
	}, [userId]);

	const setActiveTeamMutation = useMutation(
		orpc.teams.setActiveTeam.mutationOptions({
			onMutate: () => {
				// Close the switch-gate BEFORE the backend session update
				// fires. The gate blocks every OTHER outbound ORPC (main +
				// worker) at the link boundary — the `teams.setActiveTeam`
				// call is exempt in `orpc.client.ts` so this doesn't
				// deadlock. Requests already past the gate but not yet
				// dispatched will complete against the OLD `x-team-id`
				// header; that is safe because they were authorized under
				// the old team's scope.
				switchGate.close();
			},
			onSuccess: async ({ activeTeamAppId: newId }) => {
				try {
					// 1. Propagate to both header cache + worker cache atomically
					//    so subsequent requests carry the new team id. This is
					//    what the closed gate is protecting: no other RPC can
					//    dispatch until both caches are flipped.
					await syncSetActiveTeam(newId);
					// 2. The offline copy of the user names the new team too, so
					//    a loader fallback (offline, or the fresh read failing on
					//    the network) cannot hand back the old one.
					patchAuthCacheUser({ activeTeamAppId: newId });
					// 3. Re-run the router's authLoader so `sessionInfo.user.activeTeamAppId`
					//    (fed via useLoaderData) reflects the new value. Without this,
					//    the loader-derived prop stays at the old team and downstream
					//    consumers (activeWorkspace, useActiveTeamId, page enabled-gates,
					//    the initSyncForUser effect) remain out of sync with the header.
					//    `setActiveTeam` writes `users.activeTeamAppId` behind
					//    better-auth's back, and its 5-minute cookie cache would hand
					//    the loader the OLD team, which it would write back into the
					//    header cache: the switch silently reverted ("clicking a team
					//    on the profile page does nothing"). Ask for one uncached read.
					//    Awaited inside the closed gate: the loader's online path makes
					//    no gated RPC once a team is set.
					requestFreshSession();
					await revalidator.revalidate();
				} finally {
					// Reopen before invalidateQueries so the refetches it
					// triggers carry the new header instead of stalling on
					// the gate.
					switchGate.open();
				}
				// 4. Drop team-scoped React Query caches so refetches hit the
				//    backend under the new team id. Narrowed from a blanket
				//    invalidateQueries() to avoid nuking unrelated data.
				await queryClient.invalidateQueries({
					queryKey: orpc.teams.getMyTeams.queryOptions({}).queryKey,
				});
			},
			onError: (err) => {
				// The gate was closed in onMutate but the backend mutation
				// failed. Reopen so the rest of the app doesn't stall on the
				// timeout waiting for a switch that never happened.
				switchGate.open();
				toast.error(err.message || "Failed to switch team");
			},
		}),
	);

	// Listen for the DataWorker's "your active team is gone" signal.
	// Fires when the pull pipeline delivers a tombstone for either the
	// active `teams` row (team deleted) or the current user's
	// `team_members` row for the active team (membership revoked). The
	// worker has already dropped the local rows + OPFS blobs and
	// cleared its own active-team cache; our job is to move the user
	// somewhere sensible without leaving the header cache pointing at
	// a wiped team.
	//
	// Resolution goes through the same switch-gate flow as a manual
	// switch (`setActiveTeamMutation.mutateAsync`) — the closed gate
	// blocks concurrent RPCs until the header cache flips, exactly the
	// same invariant as the profile-page switcher. Bypassing it would
	// re-open the "team-A UI over team-B data" race that the gate was
	// built to eliminate.
	//
	// If no teams remain, we force sign-out — the app has no
	// meaningful state to render without an active team.
	useEffect(() => {
		if (!userId) return;
		if (typeof BroadcastChannel === "undefined") return;
		const channel = new BroadcastChannel(ACTIVE_TEAM_WIPED_CHANNEL);
		channel.onmessage = async (event: MessageEvent<ActiveTeamWipedMessage>) => {
			const msg = event.data;
			if (msg?.type !== "active-team-wiped") return;
			// A team host is locked to its team: never switch to another one.
			// The worker has already wiped the team's rows and OPFS blobs; the
			// no-access page ends the session.
			if (getTenantSlug()) {
				window.location.assign("/auth/no-access");
				return;
			}

			// Refetch teams so we know what the user still belongs to.
			// The wiped team is already gone from the server (the tombstone
			// is exactly how we learned about it), so `getMyTeams` will not
			// include it.
			const remaining = await queryClient.fetchQuery(orpc.teams.getMyTeams.queryOptions({}));

			const fallback = remaining.find((t) => t.id !== msg.wipedTeamId);
			if (fallback) {
				try {
					await setActiveTeamMutation.mutateAsync({
						teamAppId: fallback.id,
					});
					toast.info(
						`You were removed from the previous workspace. Switched to "${fallback.name}".`,
					);
				} catch (err) {
					console.warn("[WorkspaceContext] auto-switch after wipe failed", err);
				}
				return;
			}

			// No remaining teams — force sign-out. `signout` handles the
			// backend session teardown + redirect to /auth/login.
			toast.info("You were removed from your workspace. Signing you out.");
			await signout("clear-cache");
		};
		return () => {
			channel.close();
		};
	}, [userId, queryClient, setActiveTeamMutation]);

	const activeWorkspace: Workspace = (() => {
		if (!activeTeamAppId || teams.length === 0) return PLACEHOLDER_WORKSPACE;
		const active = teams.find((t) => t.id === activeTeamAppId);
		if (!active) return PLACEHOLDER_WORKSPACE;
		return {
			id: active.id,
			name: active.name,
			type: active.personalTeamForUserId === userId ? "personal" : "team",
			role: active.userRole,
		};
	})();

	return (
		<WorkspaceContext.Provider
			value={{
				activeWorkspace,
				teams,
				isLoading: isLoading && teams.length === 0,
				user: sessionInfo?.user || null,
				setActiveTeam: async (teamAppId) => {
					// No UI offers it on a team host; this keeps any future caller
					// from moving the user's server-side active team from there.
					if (getTenantSlug()) return;
					await setActiveTeamMutation.mutateAsync({ teamAppId });
				},
				isSwitching: setActiveTeamMutation.isPending,
			}}
		>
			{children}
		</WorkspaceContext.Provider>
	);
}

export const useWorkspace = () => {
	const context = useContext(WorkspaceContext);
	if (context === undefined) {
		throw new Error("useWorkspace must be used within a WorkspaceProvider");
	}
	return context;
};

// Returns the id of the active team, or `null` while it's loading. Callers
// that must have a team id (team-scoped queries) should gate on this.
export const useActiveTeamId = () => {
	const { activeWorkspace } = useWorkspace();
	return activeWorkspace.id || null;
};
