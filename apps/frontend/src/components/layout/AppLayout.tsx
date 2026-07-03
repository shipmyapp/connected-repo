import { Box } from "@connected-repo/ui-mui/layout/Box";
import { useThemeMode } from "@connected-repo/ui-mui/theme/ThemeContext";
import type { SessionInfo } from "@frontend/contexts/UserContext";
import { userContext, useSessionInfo } from "@frontend/contexts/UserContext";
import { useWorkspace, WorkspaceProvider } from "@frontend/contexts/WorkspaceContext";
import { useMediaQuery } from "@mui/material";
import Fade from "@mui/material/Fade";
import { useTheme } from "@mui/material/styles";
import { useEffect } from "react";
import { Outlet, useLoaderData } from "react-router";
import { AppBadgeSync } from "./AppBadgeSync";
import { DesktopNavbar } from "./DesktopNavbar";
import { MobileNavbar } from "./MobileNavbar";
import { OfflineBanner } from "./OfflineBanner";

export const AppLayoutContent = () => {
	const { activeWorkspace } = useWorkspace();
	const sessionInfo = useSessionInfo();
	return (
		<Fade key={activeWorkspace.id} in timeout={400}>
			<Box sx={{ height: '100%', width: '100%' }}>
				<Outlet context={sessionInfo} />
			</Box>
		</Fade>
	);
};

/**
 * AppLayout - Main layout wrapper for authenticated pages
 *
 * Responsive behavior:
 * - Mobile (< md): Bottom navigation + minimal top bar
 * - Desktop (>= md): Top navigation bar with links
 *
 * Session data is loaded by authLoader and passed to children via Outlet context
 * Child components access it via useOutletContext<SessionInfo>()
 */
export const AppLayout = () => {
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down("md"));

	// Get session data from authLoader
	const sessionInfo = useLoaderData() as SessionInfo;
	const { setThemeMode } = useThemeMode();

	useEffect(() => {
		if (sessionInfo.user?.themeSetting) {
			setThemeMode(sessionInfo.user.themeSetting);
		}
	}, [sessionInfo.user?.themeSetting, setThemeMode]);

	// NOTE: A previous version listened to `visualViewport.resize` and toggled
	// `isKeyboardOpen`, then shrunk the main padding to 0. On iOS Safari, the
	// resulting re-render + layout shift while the keyboard was opening
	// caused the input to lose focus mid-animation and dismissed the
	// keyboard again. We now leave the layout static — the browser handles
	// scrolling the focused input above the keyboard on its own.

	return (
		<userContext.Provider value={sessionInfo}>
			<WorkspaceProvider sessionInfo={sessionInfo}>
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						minHeight: "100vh",
						bgcolor: "background.default",
					}}
				>
					<OfflineBanner />
					<AppBadgeSync />
					{isMobile ? <MobileNavbar /> : <DesktopNavbar />}

					{/* Main content area */}
					<Box
						component="main"
						sx={{
							flexGrow: 1,
							pt: { xs: 2, md: 3 },
							pb: isMobile ? 10 : 3,
							px: { xs: 2, sm: 3, md: 4 },
						}}
					>
						<AppLayoutContent />
					</Box>
				</Box>
			</WorkspaceProvider>
		</userContext.Provider>
	);
};