import { createAppTheme } from "@connected-repo/ui-mui/theme/theme.config";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render } from "@testing-library/react";
import { type ReactElement, type ReactNode, useState } from "react";

const theme = createAppTheme("light");

/** A fresh query cache per render, for components that read the server; no retries in tests. */
const Providers = ({ children }: { children: ReactNode }) => {
	const [client] = useState(
		() => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
	);
	return (
		<QueryClientProvider client={client}>
			<ThemeProvider theme={theme}>{children}</ThemeProvider>
		</QueryClientProvider>
	);
};

/** Renders under the app's theme (light) with a fresh query client. */
export const renderWithTheme = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
	render(ui, { wrapper: Providers, ...options });
