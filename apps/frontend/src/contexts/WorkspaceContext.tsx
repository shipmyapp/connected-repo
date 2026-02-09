import { orpc } from "@frontend/utils/orpc.tanstack.client";
import type { UserAppBackendOutputs } from "@frontend/utils/orpc.client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSessionInfo, type SessionInfo } from "./UserContext";
import { useQuery } from "@tanstack/react-query";

export type Team = UserAppBackendOutputs["teams"]["getMyTeams"][number];

export type WorkspaceType = "personal" | "team";

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  role?: "owner" | "admin" | "user";
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  isLoading: boolean;
  setActiveWorkspaceId: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
}

interface WorkspaceProviderProps {
  children: ReactNode;
  sessionInfo?: SessionInfo;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}

const STORAGE_KEY = "oneq-active-workspace-id";

export function WorkspaceProvider({ children, sessionInfo: propSessionInfo }: WorkspaceProviderProps) {
  let sessionInfo: SessionInfo | null = null;
  try {
     sessionInfo = useSessionInfo();
  } catch (e) {
     sessionInfo = propSessionInfo || null;
  }
  
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || "personal";
  });

  const {
    data: teams = [] as Team[],
    isLoading,
    refetch,
  } = useQuery((orpc.teams.getMyTeams as any).queryOptions({
    staleTime: 1000 * 60 * 5,
    enabled: !!sessionInfo?.user,
  }));

  const personalWorkspace: Workspace = {
    id: "personal",
    name: "Personal",
    type: "personal",
  };

  const workspaces: Workspace[] = [
    personalWorkspace,
    ...(teams as Team[]).map((t: Team) => ({
      id: t.teamId,
      name: t.name,
      type: "team" as WorkspaceType,
      role: t.userRole,
    })),
  ];

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || personalWorkspace;

  useEffect(() => {
    // If active workspace is no longer available, default to personal
    if (activeWorkspaceId !== "personal" && !(teams as Team[]).some((t: Team) => t.teamId === activeWorkspaceId)) {
        if (!isLoading && (teams as Team[]).length > 0) {
            // Wait for load to ensure it's actually missing
            setActiveWorkspaceIdState("personal");
            localStorage.setItem(STORAGE_KEY, "personal");
        }
    }
  }, [teams, activeWorkspaceId, isLoading]);

  const setActiveWorkspaceId = (id: string) => {
    setActiveWorkspaceIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const refreshWorkspaces = async () => {
    await refetch();
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        isLoading,
        setActiveWorkspaceId,
        refreshWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
