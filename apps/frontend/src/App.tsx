/*
 * Copyright (c) 2025 Hexatech Hub Solutions LLP, India
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { ThemeContextProvider, useThemeMode } from "@connected-repo/ui-mui/theme/ThemeContext";
import { ErrorFallback } from "@frontend/components/error_fallback";
import { OfflineBanner } from "@frontend/components/OfflineBlocker";
import { useDataWorker } from "@frontend/hooks/useDataWorker";
import { usePWAInstall } from "@frontend/hooks/usePwaInstall";
import { useWorkerEvent } from "@frontend/hooks/useWorkerStatus";
import { router } from "@frontend/router";
import { authClient } from "@frontend/utils/auth.client";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { ErrorBoundary } from "@sentry/react";
import { Suspense, useEffect } from "react";
import { RouterProvider } from "react-router";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// App focuses on rendering the router tree and error boundaries. Providers
// (QueryClient + oRPC client) are created and mounted at the root in
// `main.tsx` following the oRPC + TanStack React Query recommended setup.
function ToastProvider() {
	const { mode } = useThemeMode();

	return (
		<ToastContainer
			position="top-right"
			autoClose={5000}
			hideProgressBar={false}
			newestOnTop={false}
			closeOnClick
			rtl={false}
			pauseOnFocusLoss
			draggable
			pauseOnHover
			theme={mode}
			style={{
				fontFamily:
					'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
			}}
			toastStyle={{
				borderRadius: "5px",
			}}
		/>
	);
}

function App() {
	console.log('[App] Rendered');
	usePWAInstall();
	useDataWorker();

	// Handle auth-expired events from the Worker without re-rendering App
	useWorkerEvent('auth-expired', (event) => {
		// Avoid infinite redirect loop if already on login page
		if (window.location.pathname === '/auth/login') {
			console.log('[App] Auth expired, but already on login page. Skipping redirect.');
			return;
		}

		console.warn('[App] Auth expired event received, redirecting to login.');
		localStorage.removeItem('connected-repo-session');
		authClient.signOut({
			fetchOptions: {
				onSuccess: () => { window.location.href = '/auth/login'; },
				onError: () => { window.location.href = '/auth/login'; },
			},
		}).catch(() => { window.location.href = '/auth/login'; });
	});

	return (
		<LocalizationProvider dateAdapter={AdapterDayjs}>
			<ThemeContextProvider>
				<Suspense fallback={<LoadingSpinner text="Loading..." />}>
					<ErrorBoundary
						fallback={<ErrorFallback />}
						beforeCapture={(scope) => {
							scope.setTag("level", "top-level");
						}}
					>
						<OfflineBanner />
						<RouterProvider router={router} />
						<ToastProvider />
					</ErrorBoundary>
				</Suspense>
			</ThemeContextProvider>
		</LocalizationProvider>
	);
}

export default App;
