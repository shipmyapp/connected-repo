import { Box } from "@connected-repo/ui-mui/layout/Box";
import { useSseStatus } from "@frontend/hooks/useWorkerStatus";
import { Tooltip, keyframes } from "@mui/material";

const pulse = keyframes`
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(76, 175, 80, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
`;

const pulseOrange = keyframes`
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(255, 152, 0, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 152, 0, 0); }
`;

export const SyncStatusIndicator = () => {
  const sseStatus = useSseStatus();

  const getStatusColor = () => {
    switch (sseStatus) {
      case 'connected': return '#4caf50'; // Green
      case 'connecting': return '#ff9800'; // Orange
      case 'disconnected': return '#f44336'; // Red
      default: return '#9e9e9e'; // Grey
    }
  };

  const getStatusLabel = () => {
    switch (sseStatus) {
      case 'connected': return 'Live sync active';
      case 'connecting': return 'Connecting to sync...';
      case 'disconnected': return 'Live sync disconnected';
      default: return 'Sync status unknown';
    }
  };

  return (
    <Tooltip title={getStatusLabel()} arrow>
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: getStatusColor(),
          display: 'inline-block',
          ml: 1,
          animation: sseStatus === 'connected' 
            ? `${pulse} 2s infinite` 
            : sseStatus === 'connecting' 
              ? `${pulseOrange} 2s infinite` 
              : 'none',
        }}
      />
    </Tooltip>
  );
};
