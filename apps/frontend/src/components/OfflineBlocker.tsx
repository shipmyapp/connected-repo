/*
 * Copyright (c) 2025 Hexatech Hub Solutions LLP, India
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { authClient } from "@frontend/utils/auth.client";
import { useIsOnline, useSseStatus } from "@frontend/hooks/useWorkerStatus";
import { dataWorkerClient } from "@frontend/worker/worker.client";
import Alert from "@mui/material/Alert";
import Slide from "@mui/material/Slide";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useEffect, useRef, useState } from "react";

/**
 * How long the connection must be "bad" before the banner appears.
 * Prevents flicker on flaky networks.
 */
const SHOW_DELAY_MS = 2_000;

/**
 * Standard MUI AppBar heights for layout offset
 */
const APP_BAR_HEIGHT_MOBILE = 56;
const APP_BAR_HEIGHT_DESKTOP = 64;

/** Display banner behind the AppBar but above most other content */
const BANNER_Z_INDEX_OFFSET = -1;

/**
 * Non-blocking offline banner. Shown below the header (fixed position)
 * when the device is offline or the server is unreachable.
 */
export function OfflineBanner() {
	const { data: session, isPending: isSessionPending } = authClient.useSession();
	const isOnline = useIsOnline();
	const sseStatus = useSseStatus();

	const isHealthy = isOnline && sseStatus === 'connected';

	// Track whether the banner should be visible
	const [visible, setVisible] = useState(false);
	// Whether the user manually dismissed it
	const [dismissed, setDismissed] = useState(false);

	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Track the previous healthy state to detect transitions
	const prevHealthyRef = useRef(isHealthy);

	useEffect(() => {
		// When connectivity recovers, reset dismissed and visibility state
		if (isHealthy) {
			if (!prevHealthyRef.current) {
				console.log("[OfflineBanner] Connectivity recovered. Clearing banner.");
				setDismissed(false);
				setVisible(false);
				if (timerRef.current) {
					clearTimeout(timerRef.current);
					timerRef.current = null;
				}
				dataWorkerClient.forceSync();
			}
		} else {
			// When connectivity is bad, start the delay timer if not already visible/dismissed
			if (!visible && !dismissed && !timerRef.current) {
				console.log(`[OfflineBanner] Connectivity bad (Online=${isOnline}, SSE=${sseStatus}). Starting ${SHOW_DELAY_MS}ms notification timer.`);
				timerRef.current = setTimeout(() => {
					setVisible(true);
					timerRef.current = null;
				}, SHOW_DELAY_MS);
			}
		}

		prevHealthyRef.current = isHealthy;

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [isHealthy, visible, dismissed]); // Removed syncManager

	// Nothing to show if healthy, if dismissed, or if the user isn't authenticated.
	// We don't want to show "Disconnected" when the user is logged out.
	if (isHealthy || !visible || dismissed || isSessionPending || !session) return null;

	let message = "Disconnected from server. Changes will sync when reconnected.";
	let severity: 'warning' | 'info' | 'error' = "warning";

	if (!isOnline) {
		message = "You are offline. Some features may be limited.";
		severity = "error";
	} else if (sseStatus === 'connecting') {
		message = "Connecting to server...";
		severity = "info";
	}

	const handleRetry = () => {
		if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
			console.log("[OfflineBanner] Manually triggering reconnection...");
			const apiUrl = (window as any).VITE_API_URL || import.meta.env.VITE_API_URL;
			navigator.serviceWorker.controller.postMessage({
				type: 'INIT_SYNC',
				payload: { 
					apiUrl,
					forceRestart: true 
				}
			});
		}
	};

	return (
		<Slide direction="down" in mountOnEnter unmountOnExit>
			<Alert
				severity={severity}
				onClose={() => setDismissed(true)}
				action={
					severity !== 'info' ? (
						<Box sx={{ display: 'flex', gap: 1 }}>
							<IconButton
								color="inherit"
								size="small"
								onClick={handleRetry}
								title="Retry Connection"
							>
								<RefreshIcon fontSize="small" />
							</IconButton>
						</Box>
					) : null
				}
				sx={{
					position: "fixed",
					top: { xs: APP_BAR_HEIGHT_MOBILE, sm: APP_BAR_HEIGHT_DESKTOP },
					left: 0,
					right: 0,
					zIndex: (theme) => theme.zIndex.appBar + BANNER_Z_INDEX_OFFSET,
					borderRadius: 0,
					boxShadow: 2,
					"& .MuiAlert-message": {
						width: "100%",
						textAlign: "center",
					},
					"& .MuiAlert-action": {
						alignItems: "center",
						padding: "0 8px",
					}
				}}
			>
				{message}
			</Alert>
		</Slide>
	);
}
