import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Slide from "@mui/material/Slide";
import { useEffect, useState } from "react";
import { useConnectivity } from "./useConnectivity.sse.sw";

export function OfflineBanner() {
	const { getDetailedStatus: status } = useConnectivity();
	const [showDelayed, setShowDelayed] = useState(false);
	const [isDismissed, setIsDismissed] = useState(false);

	const isOffline = status.code !== "OK";

	useEffect(() => {
		setIsDismissed(false); // Reset dismissal on any status change
		
		if (!isOffline) {
			setShowDelayed(false);
			return;
		}

		const timer = setTimeout(() => {
			setShowDelayed(true);
		}, 2000);

		return () => clearTimeout(timer);
	}, [status.code, isOffline]);

	const severity: "error" | "warning" =
		status.code === "LIVE_SYNC_DOWN" || status.code === "SERVER_DOWN"
			? "error"
			: "warning";

	const isShowing = isOffline && showDelayed && !isDismissed;

	return (
		<Slide
			direction="down"
			in={isShowing}
			mountOnEnter
			unmountOnExit
			timeout={{ enter: 300, exit: 0 }}
		>
			<Box
				sx={{
					position: "fixed",
					top: { xs: 56, md: 64 }, // Offset for header height
					left: 0,
					right: 0,
					zIndex: 999, // Below header (usually 1100 in MUI)
					width: "100%",
				}}
			>
				<Alert
					severity={severity}
					onClose={() => setIsDismissed(true)}
					sx={{
						borderRadius: 0,
						boxShadow: 3,
						"& .MuiAlert-message": { width: "100%" },
					}}
				>
					<AlertTitle sx={{ fontWeight: 600 }}>
						{status.title}
					</AlertTitle>
					{status.message}
				</Alert>
			</Box>
		</Slide>
	);
}