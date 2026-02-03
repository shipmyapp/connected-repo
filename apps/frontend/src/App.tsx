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
import { OfflineBlocker } from "@frontend/components/OfflineBlocker";
import { usePWAInstall } from "@frontend/hooks/usePwaInstall";
import { router } from "@frontend/router";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { ErrorBoundary } from "@sentry/react";
import { Suspense } from "react";
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

	usePWAInstall();
	
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
						<OfflineBlocker>
							<RouterProvider router={router} />
						</OfflineBlocker>
						<ToastProvider />
					</ErrorBoundary>
				</Suspense>
			</ThemeContextProvider>
		</LocalizationProvider>
	);
}

export default App;
