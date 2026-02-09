import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { AppBar } from "@connected-repo/ui-mui/navigation/AppBar";
import { Toolbar } from "@connected-repo/ui-mui/navigation/Toolbar";
import { navItems } from "@frontend/configs/nav.config";
import { SSEStatusBadge } from "@frontend/sw/sse/StatusBadge.sse.sw";
import { useLocation, useNavigate } from "react-router";
import { UserProfileMenu } from "./UserProfileMenu";
import GroupIcon from "@mui/icons-material/Group";
import TeamSwitcher from "./TeamSwitcher";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";

/**
 * DesktopNavbar - Top navigation bar for desktop layout
 *
 * Features:
 * - App logo/brand
 * - Navigation links (Dashboard, Posts, Create Post)
 * - User profile menu on right
 * - Sticky position
 */
export const DesktopNavbar = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const { activeWorkspace } = useWorkspace();

	const isActive = (path: string) => location.pathname === path;

	const isTeamOwnerAdmin = activeWorkspace.type === 'team' && (activeWorkspace.role === 'Owner' || activeWorkspace.role === 'Admin');

	return (
		<AppBar
			position="sticky"
			elevation={0}
			sx={{
				bgcolor: "background.paper",
				borderBottom: "1px solid",
				borderColor: "divider",
			}}
		>
			<Toolbar sx={{ gap: 2 }}>
				{/* Logo/Brand */}
				<Box
					onClick={() => navigate("/dashboard")}
					sx={{
						display: "flex",
						alignItems: "center",
						cursor: "pointer",
						gap: 1,
						mr: 4,
						transition: "transform 0.2s ease-in-out",
						"&:hover": {
							transform: "scale(1.02)",
						},
					}}
				>
					<Typography
						variant="h6"
						component="div"
						sx={{
							fontWeight: 700,
							color: "primary.main",
							letterSpacing: -0.5,
						}}
					>
						OneQ
					</Typography>
					<SSEStatusBadge />
				</Box>

				{/* Workspace Switcher */}
				<Box sx={{ mr: 2 }}>
					<TeamSwitcher />
				</Box>

				{/* Navigation Links */}
				<Box sx={{ flexGrow: 1, display: "flex", gap: 1 }}>
					{navItems.map((item) => (
						<Button
							key={item.path}
							onClick={() => navigate(item.path)}
							startIcon={item.desktopIcon}
							sx={{
								px: 2,
								py: 1,
								borderRadius: 2,
								color: isActive(item.path)
									? "primary.main"
									: "text.secondary",
								bgcolor: isActive(item.path)
									? "primary.lighter"
									: "transparent",
								fontWeight: isActive(item.path) ? 600 : 500,
								transition: "all 0.2s ease-in-out",
								"&:hover": {
									bgcolor: isActive(item.path)
										? "primary.light"
										: "action.hover",
									transform: "translateY(-2px)",
								},
								"&:active": {
									transform: "translateY(0)",
								},
							}}
						>
							{item.label}
						</Button>
					))}

					{isTeamOwnerAdmin && (
						<Button
							onClick={() => navigate(`/teams/${activeWorkspace.id}`)}
							startIcon={<GroupIcon fontSize="small" />}
							sx={{
								px: 2,
								py: 1,
								borderRadius: 2,
								color: isActive(`/teams/${activeWorkspace.id}`) || location.pathname.startsWith(`/teams/${activeWorkspace.id}/settings`)
									? "secondary.main"
									: "text.secondary",
								bgcolor: isActive(`/teams/${activeWorkspace.id}`) || location.pathname.startsWith(`/teams/${activeWorkspace.id}/settings`)
									? "secondary.lighter"
									: "transparent",
								fontWeight: (isActive(`/teams/${activeWorkspace.id}`) || location.pathname.startsWith(`/teams/${activeWorkspace.id}/settings`)) ? 600 : 500,
								transition: "all 0.2s ease-in-out",
								"&:hover": {
									bgcolor: (isActive(`/teams/${activeWorkspace.id}`) || location.pathname.startsWith(`/teams/${activeWorkspace.id}/settings`))
										? "secondary.light"
										: "action.hover",
									transform: "translateY(-2px)",
								},
								"&:active": {
									transform: "translateY(0)",
								},
							}}
						>
							Team
						</Button>
					)}
				</Box>

				{/* User Profile Menu */}
				<UserProfileMenu />
			</Toolbar>
		</AppBar>
	);
};
