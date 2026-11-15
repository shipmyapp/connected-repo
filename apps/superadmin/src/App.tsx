import { AppErrorBoundary } from "@connected-repo/ui-mui/feedback/AppErrorBoundary";
import { AppToastContainer } from "@connected-repo/ui-mui/feedback/AppToastContainer";
import { ThemeContextProvider } from "@connected-repo/ui-mui/theme/ThemeContext";
import { router } from "@superadmin/router";
import { queryClient } from "@superadmin/utils/query_client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import "react-toastify/dist/ReactToastify.css";

export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<ThemeContextProvider>
				<AppErrorBoundary onError={(error) => console.error("[superadmin]", error)}>
					<RouterProvider router={router} />
					<AppToastContainer autoClose={4000} />
				</AppErrorBoundary>
			</ThemeContextProvider>
		</QueryClientProvider>
	);
}
