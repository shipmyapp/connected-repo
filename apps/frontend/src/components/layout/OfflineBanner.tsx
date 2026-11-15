import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { useOnlineStatus } from "@frontend/hooks/useOnlineStatus";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import { useNavigate } from "react-router";

/**
 * Persistent banner above the app header when the browser reports the
 * device as offline. Cheap wrapper around `navigator.onLine` +
 * `online`/`offline` events. Tap navigates to the sync status page.
 */
export const OfflineBanner = () => {
	const navigate = useNavigate();
	const online = useOnlineStatus();

	if (online) return null;

	return (
		<Box
			onClick={() => navigate("/settings/sync")}
			sx={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: 1,
				py: 0.75,
				px: 2,
				bgcolor: "warning.main",
				color: "warning.contrastText",
				cursor: "pointer",
				position: "sticky",
				top: 0,
				zIndex: (t) => t.zIndex.appBar + 1,
			}}
		>
			<CloudOffIcon fontSize="small" />
			<Typography variant="body2" sx={{ fontWeight: 600 }}>
				You're offline — changes will sync when you're back online. Tap for details.
			</Typography>
		</Box>
	);
};
