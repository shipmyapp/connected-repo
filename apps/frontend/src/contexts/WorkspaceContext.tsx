import { orpc } from "@frontend/utils/orpc.tanstack.client";
import type { UserAppBackendOutputs } from "@frontend/utils/orpc.client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSessionInfo, type SessionInfo } from "./UserContext";
import { useQuery } from "@tanstack/react-query";

export type Team = UserAppBackendOutputs["teams"]["getMyTeams"][number];

export interface Workspace {
	id: string;
	name: string;
	type: "personal" | "team";
	role: Team["userRole"] | "personal";
}

interface WorkspaceContextType {
	activeWorkspace: Workspace;
	setActiveWorkspace: (workspace: Workspace) => void;
	teams: Team[];
	isLoading: boolean;
	user: SessionInfo["user"];
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

interface WorkspaceProviderProps {
	children: ReactNode;
	sessionInfo?: SessionInfo | null;
}

export function WorkspaceProvider({ children, sessionInfo: propSessionInfo }: WorkspaceProviderProps) {
	let sessionInfo: SessionInfo | null = null;
	try {
		sessionInfo = useSessionInfo();
	} catch (e) {
		sessionInfo = propSessionInfo || null;
	}

	const { data: teamsData = [], isLoading } = useQuery(orpc.teams.getMyTeams.queryOptions({}));
	const [teams, setTeams] = useState<Team[]>([]);

	// Sync teams to local DB for offline access
	useEffect(() => {
		if (teamsData.length > 0) {
			setTeams(teamsData);
			import("@frontend/worker/worker.proxy").then(({ getDataProxy }) => {
				getDataProxy().teamsAppDb.saveTeams(teamsData);
			});
		}
	}, [teamsData]);

	// Load teams from Dexie on mount (offline fallback) 
	useEffect(() => {
		if (teams.length === 0) {
			import("@frontend/worker/worker.proxy").then(({ getDataProxy }) => {
				getDataProxy().teamsAppDb.getAll().then((cachedTeams: any) => {
					if (cachedTeams && (cachedTeams as any).length > 0 && teams.length === 0) {
						setTeams(cachedTeams as Team[]);
					}
				});
			});
		}
	}, []);

	const personalWorkspace: Workspace = {
		id: sessionInfo?.user?.id || "personal",
		name: "Personal Space",
		type: "personal",
		role: "personal",
	};

	const [activeWorkspace, setActiveWorkspace] = useState<Workspace>(() => {
		const saved = localStorage.getItem("activeWorkspace");
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				// If session matched, return saved, otherwise personal
				if (parsed.type === "personal" && sessionInfo?.user?.id && parsed.id !== sessionInfo.user.id) {
					return personalWorkspace;
				}
				return parsed;
			} catch (e) {
				return personalWorkspace;
			}
		}
		return personalWorkspace;
	});

	// If we just logged in or session changed, update personal workspace ID if it was "personal"
	useEffect(() => {
		if (sessionInfo?.user?.id && activeWorkspace.id === "personal") {
			setActiveWorkspace(personalWorkspace);
		}
	}, [sessionInfo?.user?.id, activeWorkspace.id]);

	useEffect(() => {
		localStorage.setItem("activeWorkspace", JSON.stringify(activeWorkspace));
	}, [activeWorkspace]);

	return (
		<WorkspaceContext.Provider
			value={{
				activeWorkspace,
				setActiveWorkspace,
				teams: teams as Team[],
				isLoading,
				user: sessionInfo?.user || null,
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

/**
 * Simplified hook to get only the team ID if in a team workspace, or null for personal.
 */
export const useActiveTeamId = () => {
	const { activeWorkspace } = useWorkspace();
	return activeWorkspace.type === "team" ? activeWorkspace.id : null;
};
