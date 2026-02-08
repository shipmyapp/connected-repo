import { useWorkerSync } from "@frontend/hooks/useWorkerSync";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { CircularProgress } from "@connected-repo/ui-mui/feedback/CircularProgress";
import { IconButton } from "@connected-repo/ui-mui/navigation/IconButton";
import CloudIcon from "@mui/icons-material/Cloud";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import CloudQueueIcon from "@mui/icons-material/CloudQueue";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import { Box, Tooltip } from "@mui/material";

interface SyncProgressProps {
  isSyncing?: boolean;
  isOnline?: boolean;
  sseStatus?: 'connected' | 'disconnected' | 'connecting';
  progress?: { pending: number; inFlight: number; completed: number; failed: number } | null;
  onSyncTrigger?: (e?: React.MouseEvent) => void;
}

export function SyncProgress({ 
  isSyncing: propIsSyncing, 
  isOnline: propIsOnline, 
  sseStatus: propSseStatus,
  progress: propProgress, 
  onSyncTrigger: propOnSyncTrigger 
}: SyncProgressProps) {
  // Use hooks if props are not provided (Connected component mode)
  const sync = useWorkerSync();
  
  const isOnline = propIsOnline !== undefined ? propIsOnline : sync.isOnline;
  const sseStatus = propSseStatus !== undefined ? propSseStatus : sync.sseStatus;
  const progress = propProgress !== undefined ? propProgress : sync.syncProgress;
  const isSyncing = propIsSyncing !== undefined ? propIsSyncing : sync.syncManager.isSyncing;
  const onSyncTrigger = propOnSyncTrigger || (() => sync.syncManager.sync());

  const pendingCount = (progress?.pending || 0) + (progress?.inFlight || 0) + (progress?.failed || 0);
  
  // Only log if it's the connected version to avoid noise, or remove it
  // console.log(`[SyncProgress] Rendering. isSyncing: ${isSyncing}, pendingCount: ${pendingCount}`, { progress, isOnline, sseStatus });
  
  const isOffline = !isOnline || sseStatus !== 'connected';
  const hasFailed = (progress?.failed || 0) > 0;

  return (
    <Tooltip title={isOffline ? "Offline - Check connection" : isSyncing ? "Syncing..." : pendingCount === 0 ? "All items synced" : "Sync Now"}>
      <span>
        <IconButton
          onClick={(e) => onSyncTrigger(e)}
          disabled={isSyncing}
          size="small"
          sx={{
            color: isOffline ? "error.main" : isSyncing ? "info.main" : hasFailed ? "warning.main" : "primary.main",
            bgcolor: isSyncing ? "info.lighter" : "transparent",
            transition: "all 0.2s ease",
            "&:hover": {
              transform: isOffline ? "none" : "scale(1.1)",
              bgcolor: isOffline ? "transparent" : "action.hover",
            },
          }}
        >
          {isSyncing ? (
            <Box sx={{ position: "relative", display: "inline-flex" }}>
              <CircularProgress size={24} thickness={4} />
              <CloudSyncIcon 
                sx={{ 
                  position: "absolute", 
                  top: "50%", 
                  left: "50%", 
                  transform: "translate(-50%, -50%)",
                  fontSize: 14,
                }} 
              />
            </Box>
          ) : isOffline ? (
            <CloudOffIcon fontSize="small" />
          ) : hasFailed ? (
            <CloudQueueIcon fontSize="small" sx={{ color: 'warning.main' }} />
          ) : pendingCount > 0 ? (
            <CloudQueueIcon fontSize="small" />
          ) : (
            <CloudIcon fontSize="small" />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}