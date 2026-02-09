import { orpc } from "@frontend/utils/orpc.tanstack.client";
import type { UserAppBackendOutputs } from "@frontend/utils/orpc.client";
import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from "react";
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
	// Use propSessionInfo directly as it's passed from AppLayout (loader data)
	const sessionInfo = propSessionInfo;

	const { data: teamsData = [], isLoading, isFetchedAfterMount } = useQuery(orpc.teams.getMyTeams.queryOptions({}));
	const [teams, setTeams] = useState<Team[]>([]);
	const [isFirstLoad, setIsFirstLoad] = useState(true);

	// Sync teams to local DB for offline access
	useEffect(() => {
		if (isFetchedAfterMount && teamsData) {
			setTeams(teamsData);
			import("@frontend/worker/worker.proxy").then(({ getDataProxy }) => {
				getDataProxy().teamsAppDb.saveTeams(teamsData);
			});
			setIsFirstLoad(false);
		}
	}, [teamsData, isFetchedAfterMount]);

	// Load teams from Dexie on mount (offline fallback) 
	useEffect(() => {
		let isMounted = true;
		if (isFirstLoad) {
			import("@frontend/worker/worker.proxy").then(({ getDataProxy }) => {
				getDataProxy().teamsAppDb.getAll().then((cachedTeams: any) => {
					if (isMounted && cachedTeams && (cachedTeams as any).length > 0 && isFirstLoad) {
						setTeams(cachedTeams as Team[]);
					}
				});
			});
		}
		return () => { isMounted = false; };
	}, [isFirstLoad]);

	const personalWorkspace: Workspace = useMemo(() => ({
		id: sessionInfo?.user?.id || "personal",
		name: "Personal Space",
		type: "personal",
		role: "personal",
	}), [sessionInfo?.user?.id]);

	const [activeWorkspace, setActiveWorkspace] = useState<Workspace>(() => {
		const userId = sessionInfo?.user?.id;
		if (!userId) return {
			id: "personal",
			name: "Personal Space",
			type: "personal",
			role: "personal",
		};

		const storageKey = `activeWorkspace_${userId}`;
		const saved = localStorage.getItem(storageKey);
		
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				if (parsed.type === "personal" && parsed.id !== userId) {
					return {
						id: userId,
						name: "Personal Space",
						type: "personal",
						role: "personal",
					};
				}
				return parsed;
			} catch (e) {
				// Fallback handled below
			}
		}
		
		return {
			id: userId,
			name: "Personal Space",
			type: "personal",
			role: "personal",
		};
	});

	// Validation and auto-selection logic
	useEffect(() => {
		if (teams.length === 0 || !sessionInfo?.user?.id) {
			return;
		}

		const userId = sessionInfo.user.id;
		const storageKey = `activeWorkspace_${userId}`;
		const hasSaved = !!localStorage.getItem(storageKey);

		if (!hasSaved && activeWorkspace.id === personalWorkspace.id) {
			// Auto-select latest joined team if nothing is saved
			const sortedTeams = [...teams].sort((a, b) => {
				const timeA = (a as any).joinedAt || 0;
				const timeB = (b as any).joinedAt || 0;
				return timeB - timeA;
			});
			
			if (sortedTeams[0]) {
				const latestTeam = sortedTeams[0];
				setActiveWorkspace({
					id: latestTeam.teamAppId,
					name: latestTeam.name,
					type: "team",
					role: latestTeam.userRole,
				});
			}
		} else if (activeWorkspace.type === "team") {
			// Validate current team exists and update role if needed
			const currentTeam = teams.find(t => t.teamAppId === activeWorkspace.id);
			if (!currentTeam) {
				setActiveWorkspace(personalWorkspace);
			} else if (currentTeam.userRole !== activeWorkspace.role) {
				setActiveWorkspace({
					...activeWorkspace,
					role: currentTeam.userRole
				});
			}
		}
	}, [teams, sessionInfo?.user?.id, activeWorkspace.id, activeWorkspace.type, personalWorkspace.id]);

	// Sync personal workspace ID if user session changes
	useEffect(() => {
		if (sessionInfo?.user?.id && activeWorkspace.type === "personal" && activeWorkspace.id !== sessionInfo.user.id) {
			setActiveWorkspace(personalWorkspace);
		}
	}, [sessionInfo?.user?.id, activeWorkspace.type, personalWorkspace]);

	// Persist changes to user-specific key
	useEffect(() => {
		const userId = sessionInfo?.user?.id;
		if (userId) {
			localStorage.setItem(`activeWorkspace_${userId}`, JSON.stringify(activeWorkspace));
			localStorage.removeItem("activeWorkspace"); // Clean up legacy key
		}
	}, [activeWorkspace, sessionInfo?.user?.id]);

	return (
		<WorkspaceContext.Provider
			value={{
				activeWorkspace,
				setActiveWorkspace,
				teams: teams as Team[],
				isLoading: isLoading && teams.length === 0,
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

export const useActiveTeamId = () => {
	const { activeWorkspace } = useWorkspace();
	return activeWorkspace.type === "team" ? activeWorkspace.id : null;
};
