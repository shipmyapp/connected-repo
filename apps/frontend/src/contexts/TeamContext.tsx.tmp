import { orpc, type UserAppBackendOutputs } from "@frontend/utils/orpc.client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useOutletContext } from "react-router";
import type { SessionInfo } from "./UserContext";
import { useQuery } from "@tanstack/react-query";

// Infer Team type from backend output
type Team = UserAppBackendOutputs["userTeams"]["getMyTeams"][number];

interface TeamContextType {
	teams: Team[];
	currentTeam: Team | null;
	isLoading: boolean;
	setCurrentTeam: (team: Team) => void;
	refreshTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextType | null>(null);

export function useTeam() {
	const context = useContext(TeamContext);
	if (!context) {
		throw new Error("useTeam must be used within a TeamProvider");
	}
	return context;
}

interface TeamProviderProps {
	children: ReactNode;
    sessionInfo: SessionInfo;
}

const STORAGE_KEY = "connected-repo-current-team-id";

export function TeamProvider({ children, sessionInfo }: TeamProviderProps) {
	// sessionInfo is now passed as a prop, avoiding useOutletContext issues


	const [currentTeam, setCurrentTeamState] = useState<Team | null>(null);
	
	// Fetch teams using oRPC
	const { 
		data: teams = [], 
		isLoading, 
		refetch 
	} = useQuery(orpc.userTeams.getMyTeams.queryOptions({
		staleTime: 1000 * 60 * 5, // 5 minutes
        enabled: !!sessionInfo?.user, // Only fetch if user is logged in
        refetchOnMount: true,
        refetchOnWindowFocus: true,
	}));

	// Debug logs
    // console.log("[TeamProvider] Render", { 
    //     hasUser: !!sessionInfo?.user, 
    //     isLoading, 
    //     teamsCount: teams.length, 
    //     currentTeamId: currentTeam?.userTeamId 
    // });

	// Initialize current team from storage or default to first team
	useEffect(() => {
        console.log("[TeamProvider] Effect triggered", { 
            isLoading, 
            teamsCount: teams.length, 
            currentTeamId: currentTeam?.userTeamId,
            storedTeamId: localStorage.getItem(STORAGE_KEY)
        });

		if (isLoading) {
            return;
        }
        
        // If no teams, ensure current team is null
        if (teams.length === 0) {
            if (currentTeam) {
                console.log("[TeamProvider] No teams found, clearing current team");
                setCurrentTeamState(null);
                localStorage.removeItem(STORAGE_KEY);
            }
            return;
        }

		const storedTeamId = localStorage.getItem(STORAGE_KEY);
		const storedTeam = teams.find(t => t.userTeamId === storedTeamId);

		if (storedTeam) {
			if (currentTeam?.userTeamId !== storedTeam.userTeamId) {
                console.log("[TeamProvider] Restoring team from storage", storedTeam.userTeamId);
				setCurrentTeamState(storedTeam);
			}
		} else {
            // Check if current team is still valid
            const currentTeamIsValid = currentTeam && teams.find(t => t.userTeamId === currentTeam.userTeamId);

			// Default to first team if no valid current team
			if (!currentTeamIsValid) {
                console.log("[TeamProvider] Defaulting to first team", teams[0]!.userTeamId);
				setCurrentTeamState(teams[0]!);
                localStorage.setItem(STORAGE_KEY, teams[0]!.userTeamId);
			}
		}
	}, [teams, isLoading, currentTeam]);

	const setCurrentTeam = (team: Team) => {
		setCurrentTeamState(team);
		localStorage.setItem(STORAGE_KEY, team.userTeamId);
	};

	const refreshTeams = async () => {
		await refetch();
	};

	const value = {
		teams,
		currentTeam,
		isLoading,
		setCurrentTeam,
		refreshTeams,
	};

	return (
		<TeamContext.Provider value={value}>
			{children}
		</TeamContext.Provider>
	);
}
