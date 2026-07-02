import {
	ACTIVE_TEAM_WIPED_CHANNEL,
	type ActiveTeamWipedMessage,
} from "@frontend/utils/active_team_wiped.channel";
import type { UserAppBackendOutputs } from "@frontend/utils/orpc.client";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { signout } from "@frontend/utils/signout.utils";
import { switchGate } from "@frontend/utils/switch_gate";
import {
	initSyncForUser,
	setActiveTeam as syncSetActiveTeam,
} from "@frontend/utils/sync-triggers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { useRevalidator } from "react-router";
import { toast } from "react-toastify";
import type { SessionInfo } from "./UserContext";

export type Team = UserAppBackendOutputs["teams"]["getMyTeams"][number];

// Kept for backwards compatibility with existing consumers. Every user
// always has an active team (personal on signup), so `activeWorkspace` is
// never undefined once the session is loaded.
export interface Workspace {
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

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(
	undefined,
);

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

export function WorkspaceProvider({
	children,
	sessionInfo,
}: WorkspaceProviderProps) {
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
	useEffect(() => {
		if (!userId) return;
		void initSyncForUser(userId, activeTeamAppId);
	}, [userId, activeTeamAppId]);

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
					// 2. Re-run the router's authLoader so `sessionInfo.user.activeTeamAppId`
					//    (fed via useLoaderData) reflects the new value. Without this,
					//    the loader-derived prop stays at the old team and downstream
					//    consumers (activeWorkspace, useActiveTeamId, page enabled-gates,
					//    the initSyncForUser effect) remain out of sync with the header,
					//    causing team-B data to render under a team-A UI.
					revalidator.revalidate();
				} finally {
					// Reopen before invalidateQueries so the refetches it
					// triggers carry the new header instead of stalling on
					// the gate.
					switchGate.open();
				}
				// 3. Drop team-scoped React Query caches so refetches hit the
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
			if (!msg || msg.type !== "active-team-wiped") return;

			// Refetch teams so we know what the user still belongs to.
			// The wiped team is already gone from the server (the tombstone
			// is exactly how we learned about it), so `getMyTeams` will not
			// include it.
			const remaining = await queryClient.fetchQuery(
				orpc.teams.getMyTeams.queryOptions({}),
			);

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
					console.warn(
						"[WorkspaceContext] auto-switch after wipe failed",
						err,
					);
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
