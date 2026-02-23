import { Box } from "@connected-repo/ui-mui/layout/Box";
import { useThemeMode } from "@connected-repo/ui-mui/theme/ThemeContext";
import { PwaInstallPrompt } from "@frontend/components/pwa/install_prompt.pwa";
import { PwaUpdatePrompt } from "@frontend/components/pwa/update_prompt.pwa";
import type { SessionInfo } from "@frontend/contexts/UserContext";
import { OfflineBanner } from "@frontend/sw/sse/OfflineBanner.sse.sw";
import { useMediaQuery } from "@mui/material";
import Fade from "@mui/material/Fade";
import { useTheme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { Outlet, useLoaderData } from "react-router";
import { DesktopNavbar } from "./DesktopNavbar";
import { MobileNavbar } from "./MobileNavbar";
import { useWorkspace, WorkspaceProvider } from "@frontend/contexts/WorkspaceContext";
import { userContext, useSessionInfo } from "@frontend/contexts/UserContext";

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
	const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

	// Get session data from authLoader
	const sessionInfo = useLoaderData() as SessionInfo;
	const { setThemeMode } = useThemeMode();

	useEffect(() => {
		if (sessionInfo.user?.themeSetting) {
			setThemeMode(sessionInfo.user.themeSetting);
		}
	}, [sessionInfo.user?.themeSetting, setThemeMode]);


	// Detection for mobile keyboard to hide navbars and maximize space
	useEffect(() => {
		if (!isMobile) return;

		const handleResize = () => {
			if (window.visualViewport) {
				const isCurrentlyOpen = window.visualViewport.height < window.innerHeight * 0.8;
				setIsKeyboardOpen(isCurrentlyOpen);
			}
		};

		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', handleResize);
			return () => window.visualViewport?.removeEventListener('resize', handleResize);
		}
	}, [isMobile]);

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
					{isMobile ? <MobileNavbar /> : <DesktopNavbar />}
					<OfflineBanner />

					{/* Main content area */}
					<Box
						component="main"
						sx={{
							flexGrow: 1,
							pt: isMobile && isKeyboardOpen ? 0 : { xs: 2, md: 3 },
							pb: isMobile ? (isKeyboardOpen ? 0 : 10) : 3, // Remove bottom nav padding when keyboard open
							px: { xs: 2, sm: 3, md: 4 },
							transition: 'all 0.2s ease-in-out'
						}}
					>
						<AppLayoutContent />
						<PwaInstallPrompt />
						<PwaUpdatePrompt />
					</Box>
				</Box>
			</WorkspaceProvider>
		</userContext.Provider>
	);
};