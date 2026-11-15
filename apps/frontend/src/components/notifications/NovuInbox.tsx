import { useThemeMode } from "@connected-repo/ui-mui/theme/ThemeContext";
import { env } from "@frontend/configs/env.config";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useTheme } from "@mui/material/styles";
import { inboxDarkTheme } from "@novu/js/themes";
import { Inbox } from "@novu/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";

export const NovuInbox = () => {
	const navigate = useNavigate();
	const theme = useTheme();
	const { actualMode } = useThemeMode();

	const { data: creds } = useQuery({
		...orpc.notifications.inboxCredentials.queryOptions({}),
		staleTime: Number.POSITIVE_INFINITY,
	});

	if (!env.VITE_NOVU_APP_IDENTIFIER || !env.VITE_NOVU_API_URL || !env.VITE_NOVU_SOCKET_URL)
		return null;
	if (!creds) return null;

	return (
		<Inbox
			applicationIdentifier={env.VITE_NOVU_APP_IDENTIFIER}
			subscriberId={creds.subscriberId}
			subscriberHash={creds.subscriberHash}
			backendUrl={env.VITE_NOVU_API_URL}
			socketUrl={env.VITE_NOVU_SOCKET_URL}
			routerPush={(path: string) => navigate(path)}
			appearance={{
				baseTheme: actualMode === "dark" ? inboxDarkTheme : undefined,
				variables: {
					colorPrimary: theme.palette.primary.main,
					colorPrimaryForeground: theme.palette.primary.contrastText,
					colorSecondary: theme.palette.action.hover,
					colorSecondaryForeground: theme.palette.text.primary,
					colorBackground: theme.palette.background.paper,
					colorForeground: theme.palette.text.primary,
					colorNeutral: theme.palette.divider,
					fontSize: `${theme.typography.fontSize}px`,
				},
			}}
		/>
	);
};
