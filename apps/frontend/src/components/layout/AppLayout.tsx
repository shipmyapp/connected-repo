import { Box } from "@connected-repo/ui-mui/layout/Box";
import { useThemeMode } from "@connected-repo/ui-mui/theme/ThemeContext";
import { PwaInstallPrompt } from "@frontend/components/pwa/install_prompt.pwa";
import { PwaUpdatePrompt } from "@frontend/components/pwa/update_prompt.pwa";
import { TeamProvider } from "@frontend/contexts/TeamContext";
import type { SessionInfo } from "@frontend/contexts/UserContext";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEffect } from "react";
import { Outlet, useLoaderData } from "react-router";
import { DesktopNavbar } from "./DesktopNavbar";
import { MobileNavbar } from "./MobileNavbar";

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

	return (
        <TeamProvider sessionInfo={sessionInfo}>
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100vh",
                    bgcolor: "background.default",
                }}
            >
                {isMobile ? <MobileNavbar /> : <DesktopNavbar />}

                {/* Main content area */}
                <Box
                    component="main"
                    sx={{
                        flexGrow: 1,
                        pt: { xs: 2, md: 3 },
                        pb: { xs: 10, md: 3 }, // Extra padding bottom on mobile for bottom nav
                        px: { xs: 2, sm: 3, md: 4 },
                    }}
                >
                    <Outlet context={sessionInfo} />
                    <PwaInstallPrompt />
                    <PwaUpdatePrompt />
                </Box>
            </Box>
        </TeamProvider>
	);
};
