import { SyncAllIcon } from "@connected-repo/ui-mui/icons/CrossedOffCloudIcon";
import { Box } from "@connected-repo/ui-mui/layout/Box";

interface SyncStatusIndicatorProps {
  isPending: boolean;
  size?: "small" | "medium" | "large";
}

export function SyncStatusIndicator({ isPending, size = "medium" }: SyncStatusIndicatorProps) {
  if (!isPending) {
    return null;
  }

  const sizeMap = {
    small: 16,
    medium: 20,
    large: 24,
  };

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        color: "warning.main",
        fontSize: sizeMap[size],
      }}
    >
      <SyncAllIcon fontSize={size} />
      <Box component="span" sx={{ fontSize: "0.75rem", fontWeight: 500 }}>
        Not Synced
      </Box>
    </Box>
  );
}