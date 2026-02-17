import { orpc } from "@frontend/utils/orpc.tanstack.client";
import type { UserAppBackendOutputs } from "@frontend/utils/orpc.client";
import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from "react";
import { useSessionInfo, type SessionInfo } from "./UserContext";
import { useQuery } from "@tanstack/react-query";
import { useLocalDb } from "@frontend/worker/db/hooks/useLocalDb";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import { DB_UPDATES_CHANNEL, DbUpdateMessage } from "@frontend/configs/channels.config";

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

	// Use local DB as the source of truth for teams. 
	// This hook listens to "teamsApp" updates.
	const { data: teams = [], isLoading, refetch } = useLocalDb<Team>(
		"teamsApp",
		() => {
			if (!sessionInfo?.user?.id) return Promise.resolve([]);
			return getDataProxy().teamsAppDb.getAllWithRole(sessionInfo.user.id).then(res => (res as Team[]) || []);
		},
		[sessionInfo?.user?.id]
	);

	// Also listen for teamMembers updates to ensure role changes are reactive
	useEffect(() => {
		const dbUpdatesChannel = new BroadcastChannel(DB_UPDATES_CHANNEL);
		const handleMessage = (event: MessageEvent<DbUpdateMessage>) => {
			const { table } = event.data;
			if (table === "teamMembers") {
				refetch();
			}
		};
		dbUpdatesChannel.addEventListener('message', handleMessage);
		return () => {
			dbUpdatesChannel.removeEventListener('message', handleMessage);
			dbUpdatesChannel.close();
		};
	}, [refetch]);

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
