import type { UserAppBackendOutputs } from "@frontend/utils/orpc.client";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import {
	initSyncForUser,
	setActiveTeam as syncSetActiveTeam,
} from "@frontend/utils/sync-triggers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect } from "react";
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
			onSuccess: async ({ activeTeamAppId: newId }) => {
				// 1. Propagate to both header cache + worker cache atomically.
				await syncSetActiveTeam(newId);
				// 2. Refresh session so `sessionInfo.user.activeTeamAppId`
				//    reflects the new value; drives navbar + gating.
				await queryClient.invalidateQueries();
			},
			onError: (err) => {
				toast.error(err.message || "Failed to switch team");
			},
		}),
	);

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
