import type { UserAppBackendOutputs } from "@frontend/utils/orpc.client";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { SessionInfo } from "./UserContext";

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
	const sessionInfo = propSessionInfo;

	// Fetch teams from the backend via oRPC.
	const { data: teams = [], isLoading } = useQuery({
		...orpc.teams.getMyTeams.queryOptions({}),
		enabled: !!sessionInfo?.user?.id,
	});

	const personalWorkspace: Workspace = useMemo(() => ({
		id: sessionInfo?.user?.id || "personal",
		name: "Personal Space",
		type: "personal",
		role: "personal",
	}), [sessionInfo?.user?.id]);

	const [activeWorkspace, setActiveWorkspace] = useState<Workspace>(() => {
		const userId = sessionInfo?.user?.id;
		if (!userId) {
			return {
				id: "personal",
				name: "Personal Space",
				type: "personal",
				role: "personal",
			};
		}

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
			} catch {
				// fallthrough to default
			}
		}

		return {
			id: userId,
			name: "Personal Space",
			type: "personal",
			role: "personal",
		};
	});

	// Validation + auto-selection logic.
	useEffect(() => {
		if (teams.length === 0 || !sessionInfo?.user?.id) {
			return;
		}

		const userId = sessionInfo.user.id;
		const storageKey = `activeWorkspace_${userId}`;
		const hasSaved = !!localStorage.getItem(storageKey);

		if (!hasSaved && activeWorkspace.id === personalWorkspace.id) {
			const sortedTeams = [...teams].sort((a, b) => {
				const timeA = a.joinedAt || 0;
				const timeB = b.joinedAt || 0;
				return timeB - timeA;
			});

			if (sortedTeams[0]) {
				const latestTeam = sortedTeams[0];
				setActiveWorkspace({
					id: latestTeam.id,
					name: latestTeam.name,
					type: "team",
					role: latestTeam.userRole,
				});
			}
		} else if (activeWorkspace.type === "team") {
			const currentTeam = teams.find((t) => t.id === activeWorkspace.id);
			if (!currentTeam) {
				setActiveWorkspace(personalWorkspace);
			} else if (currentTeam.userRole !== activeWorkspace.role) {
				setActiveWorkspace({
					...activeWorkspace,
					role: currentTeam.userRole,
				});
			}
		}
	}, [teams, sessionInfo?.user?.id, activeWorkspace, personalWorkspace]);

	// Keep personal workspace id aligned with the current session.
	useEffect(() => {
		if (
			sessionInfo?.user?.id &&
			activeWorkspace.type === "personal" &&
			activeWorkspace.id !== sessionInfo.user.id
		) {
			setActiveWorkspace(personalWorkspace);
		}
	}, [sessionInfo?.user?.id, activeWorkspace, personalWorkspace]);

	// Persist changes per user.
	useEffect(() => {
		const userId = sessionInfo?.user?.id;
		if (userId) {
			localStorage.setItem(`activeWorkspace_${userId}`, JSON.stringify(activeWorkspace));
			localStorage.removeItem("activeWorkspace"); // legacy key cleanup
		}
	}, [activeWorkspace, sessionInfo?.user?.id]);

	return (
		<WorkspaceContext.Provider
			value={{
				activeWorkspace,
				setActiveWorkspace,
				teams,
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
