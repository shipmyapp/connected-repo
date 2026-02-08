import CloseIcon from "@mui/icons-material/Close";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Slide from "@mui/material/Slide";
import { useEffect, useState } from "react";
import { useConnectivity } from "./useConnectivity.sse.sw";

export function OfflineBanner() {
	const { getDetailedStatus: status, reconnect } = useConnectivity();
	const [showDelayed, setShowDelayed] = useState(false);
	const [isDismissed, setIsDismissed] = useState(false);
	const [isReconnecting, setIsReconnecting] = useState(false);

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

	const handleReconnect = async () => {
		setIsReconnecting(true);
		await reconnect();
		// Small delay to show state change feedback
		setTimeout(() => setIsReconnecting(false), 2000);
	};

	const severity: "error" | "warning" =
		status.code === "LIVE_SYNC_DOWN" || status.code === "SERVER_DOWN"
			? "error"
			: "warning";

	const isShowing = isOffline && showDelayed && !isDismissed;

	const action = (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
			{status.code === "LIVE_SYNC_DOWN" && (
				<Button 
					color="inherit" 
					size="small" 
					onClick={handleReconnect}
					disabled={isReconnecting}
					sx={{ fontWeight: 600, mr: 1 }}
				>
					{isReconnecting ? "Syncing..." : "Retry Sync"}
				</Button>
			)}
			<IconButton
				aria-label="close"
				color="inherit"
				size="small"
				onClick={() => setIsDismissed(true)}
			>
				<CloseIcon fontSize="small" />
			</IconButton>
		</Box>
	);

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
					action={action}
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