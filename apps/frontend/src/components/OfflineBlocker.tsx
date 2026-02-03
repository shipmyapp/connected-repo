/*
 * Copyright (c) 2025 Hexatech Hub Solutions LLP, India
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { env } from "@frontend/configs/env.config";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Slide from "@mui/material/Slide";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useRef, useState } from "react";

const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds

// Reliable endpoint to verify actual internet connectivity (not our server)
const INTERNET_CHECK_URL = "https://www.google.com/generate_204";

type ConnectionStatus = "checking" | "no-internet" | "internet-only" | "connected";

interface OfflineBlockerProps {
	children: React.ReactNode;
}

export function OfflineBlocker({ children }: OfflineBlockerProps) {
	const [hasNetworkInterface, setHasNetworkInterface] = useState(() => navigator.onLine);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("checking");
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const isAppReady = connectionStatus === "connected";

	// Listen for online/offline events (network interface only)
	useEffect(() => {
		const handleOnline = () => setHasNetworkInterface(true);
		const handleOffline = () => setHasNetworkInterface(false);

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	// Check both internet connectivity and backend health
	const checkConnection = useCallback(async () => {
		if (!hasNetworkInterface) {
			setConnectionStatus("no-internet");
			return;
		}

		setConnectionStatus("checking");

		// First, verify actual internet connectivity
		let hasInternet = false;
		try {
			const internetController = new AbortController();
			const internetTimeoutId = setTimeout(
				() => internetController.abort(),
				HEALTH_CHECK_TIMEOUT,
			);

			// Try to reach a reliable external endpoint
			await fetch(INTERNET_CHECK_URL, {
				method: "HEAD",
				mode: "no-cors",
				signal: internetController.signal,
			});

			clearTimeout(internetTimeoutId);
			hasInternet = true;
		} catch {
			hasInternet = false;
		}

		if (!hasInternet) {
			setConnectionStatus("no-internet");
			return;
		}

		// Internet works, now check our backend
		try {
			const backendController = new AbortController();
			const backendTimeoutId = setTimeout(
				() => backendController.abort(),
				HEALTH_CHECK_TIMEOUT,
			);

			const response = await fetch(`${env.VITE_API_URL}/user-app/health`, {
				method: "GET",
				credentials: "include",
				signal: backendController.signal,
			});

			clearTimeout(backendTimeoutId);

			if (response.ok) {
				setConnectionStatus("connected");
			} else {
				setConnectionStatus("internet-only");
			}
		} catch {
			setConnectionStatus("internet-only");
		}
	}, [hasNetworkInterface]);

	// Periodic connection checks
	useEffect(() => {
		checkConnection();
		intervalRef.current = setInterval(checkConnection, HEALTH_CHECK_INTERVAL);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, [checkConnection]);

	// Check immediately when network interface comes back
	useEffect(() => {
		if (hasNetworkInterface) {
			checkConnection();
		}
	}, [hasNetworkInterface, checkConnection]);

	// If app is ready, render children with banner
	if (isAppReady) {
		return (
			<>
				{children}
			</>
		);
	}

	// Show appropriate blocking message based on status
	let title = "";
	let message = "";
	let showSpinner = false;
	let severity: "error" | "warning" = "error";

	if (!hasNetworkInterface || connectionStatus === "no-internet") {
		severity = "error";
		title = "No Internet Connection";
		message =
			"Your device cannot reach the internet. Please check your WiFi or mobile data connection.";
	} else if (connectionStatus === "checking") {
		severity = "warning";
		title = "Checking Connection...";
		message = "Verifying your internet and server connectivity.";
		showSpinner = true;
	} else if (connectionStatus === "internet-only") {
		severity = "error";
		title = "Server Unavailable";
		message =
			"Our servers are currently unreachable. Please try again later.";
	}

	// Determine if we show banner (has internet but server down) vs full blocker
	const showBannerOnly =
		connectionStatus === "internet-only" || connectionStatus === "checking";

	if (showBannerOnly) {
		return (
			<>
				<Slide direction="down" in={true} mountOnEnter unmountOnExit>
					<Box
						sx={{
							position: "fixed",
							top: 0,
							left: 0,
							right: 0,
							zIndex: 9999,
						}}
					>
					<Alert
						severity={severity}
						sx={{
							borderRadius: 0,
							"& .MuiAlert-message": {
								width: "100%",
							},
						}}
					>
						<AlertTitle sx={{ fontWeight: 600 }}>
							{connectionStatus === "checking"
								? "Checking Connection"
								: "Server Unavailable"}
						</AlertTitle>
						{connectionStatus === "checking"
							? "Verifying internet and server connectivity..."
							: "Our servers are unreachable. Some features may not work."}
					</Alert>
					</Box>
				</Slide>
				{children}
			</>
		);
	}

	// Full blocker when completely offline
	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				minHeight: "100vh",
				p: 3,
				bgcolor: "background.default",
				textAlign: "center",
			}}
		>
			{showSpinner && (
				<CircularProgress
					size={48}
					sx={{ mb: 3, color: "primary.main" }}
				/>
			)}
			<Typography
				variant="h5"
				sx={{
					fontWeight: 600,
					mb: 2,
					color: "text.primary",
				}}
			>
				{title}
			</Typography>
			<Typography
				variant="body1"
				sx={{
					color: "text.secondary",
					maxWidth: 400,
					lineHeight: 1.7,
				}}
			>
				{message}
			</Typography>
		</Box>
	);
}
