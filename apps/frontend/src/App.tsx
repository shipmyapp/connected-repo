/*
 * Copyright (c) 2025 Hexatech Hub Solutions LLP, India
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { AppErrorBoundary } from "@connected-repo/ui-mui/feedback/AppErrorBoundary";
import { AppToastContainer } from "@connected-repo/ui-mui/feedback/AppToastContainer";
import { ThemeContextProvider } from "@connected-repo/ui-mui/theme/ThemeContext";
import { PwaInstallHost } from "@frontend/components/notifications/PwaInstallHost";
import { captureTopLevelError } from "@frontend/instrumentation";
import { router } from "@frontend/router";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { Suspense } from "react";
import { RouterProvider } from "react-router";
import "react-toastify/dist/ReactToastify.css";

// App focuses on rendering the router tree and error boundaries. Providers
// (QueryClient + oRPC client) are created and mounted at the root in
// `main.tsx` following the oRPC + TanStack React Query recommended setup.
function App() {
	return (
		<LocalizationProvider dateAdapter={AdapterDayjs}>
			<ThemeContextProvider>
				<Suspense fallback={<LoadingSpinner text="Loading..." />}>
					<AppErrorBoundary
						onError={(error, info) => void captureTopLevelError(error, info.componentStack)}
					>
						<PwaInstallHost>
							<RouterProvider router={router} />
							<AppToastContainer
								newestOnTop={false}
								rtl={false}
								pauseOnFocusLoss
								hideProgressBar={false}
								style={{
									fontFamily:
										'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
								}}
								toastStyle={{ borderRadius: "5px" }}
							/>
						</PwaInstallHost>
					</AppErrorBoundary>
				</Suspense>
			</ThemeContextProvider>
		</LocalizationProvider>
	);
}

export default App;
