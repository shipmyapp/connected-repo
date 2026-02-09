import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { AppBar } from "@connected-repo/ui-mui/navigation/AppBar";
import { BottomNavigation } from "@connected-repo/ui-mui/navigation/BottomNavigation";
import { BottomNavigationAction } from "@connected-repo/ui-mui/navigation/BottomNavigationAction";
import { Toolbar } from "@connected-repo/ui-mui/navigation/Toolbar";
import { navItems } from "@frontend/configs/nav.config";
import { SSEStatusBadge } from "@frontend/sw/sse/StatusBadge.sse.sw";
import { useLocation, useNavigate } from "react-router";
import { UserProfileMenu } from "@frontend/components/layout/UserProfileMenu";
import TeamSwitcher from "@frontend/components/layout/TeamSwitcher";
import GroupIcon from "@mui/icons-material/Group";
import PersonIcon from "@mui/icons-material/Person";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";

export const MobileNavbar = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const { activeWorkspace } = useWorkspace();

	const isTeamOwnerAdmin = activeWorkspace.type === 'team' && (activeWorkspace.role === 'Owner' || activeWorkspace.role === 'Admin');

	// Map paths to bottom nav indices
	const getBottomNavValue = () => {
		// Check navigation items first
		const navIndex = navItems.findIndex(item => item.path === location.pathname);
		if (navIndex !== -1) return navIndex;

		// Team button index
		if (isTeamOwnerAdmin && (location.pathname === `/teams/${activeWorkspace.id}` || location.pathname.startsWith(`/teams/${activeWorkspace.id}/settings`))) {
			return navItems.length;
		}

		// Profile is after Team (if visible) or after navItems
		const profileIndex = isTeamOwnerAdmin ? navItems.length + 1 : navItems.length;
		if (location.pathname === "/profile") return profileIndex;

		return 0; // Default to first nav item (Dashboard)
	};

	const handleBottomNavChange = (_event: React.SyntheticEvent, newValue: number) => {
		// If Team is visible, it's at navItems.length
		if (isTeamOwnerAdmin && newValue === navItems.length) {
			navigate(`/teams/${activeWorkspace.id}`);
			return;
		}

		// Profile index depends on Team visibility
		const profileIndex = isTeamOwnerAdmin ? navItems.length + 1 : navItems.length;
		if (newValue === profileIndex) {
			navigate("/profile");
			return;
		}

		// Navigate to the selected nav item
		const item = navItems[newValue];
		if (item) {
			navigate(item.path);
		}
	};

	return (
		<>
			{/* Top AppBar */}
			<AppBar
				position="sticky"
				elevation={0}
				sx={{
					bgcolor: "background.paper",
					borderBottom: "1px solid",
					borderColor: "divider",
				}}
			>
				<Toolbar
					sx={{
						minHeight: 56,
						px: 2,
						justifyContent: "space-between",
					}}
				>
					{/* Logo */}
					<Box
						onClick={() => navigate("/dashboard")}
						sx={{
							display: "flex",
							alignItems: "center",
							cursor: "pointer",
							gap: 1
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
					<TeamSwitcher />

					{/* User Avatar - triggers menu */}
					<UserProfileMenu />
				</Toolbar>
			</AppBar>

			{/* Bottom Navigation */}
			<Paper
				sx={{
					position: "fixed",
					bottom: 0,
					left: 0,
					right: 0,
					zIndex: 1000,
					borderTop: "1px solid",
					borderColor: "divider",
				}}
				elevation={3}
			>
				<BottomNavigation
					value={getBottomNavValue()}
					onChange={handleBottomNavChange}
					showLabels
					sx={{
						height: 64,
						"& .MuiBottomNavigationAction-root": {
							minWidth: 60,
							px: 0,
							transition: "all 0.2s ease-in-out",
							"&.Mui-selected": {
								color: "primary.main",
								"& .MuiSvgIcon-root": {
									transform: "scale(1.1)",
								},
							},
							"&:active": {
								transform: "scale(0.95)",
							},
						},
					}}
				>
					{/* Navigation items from config */}
					{navItems.map((item) => (
						<BottomNavigationAction
							key={item.path}
							label={item.label}
							icon={item.mobileIcon || item.desktopIcon}
							sx={{
								"&:hover": {
									bgcolor: "action.hover",
								},
							}}
						/>
					))}

					{/* Team item if visible */}
					{isTeamOwnerAdmin && (
						<BottomNavigationAction
							label="Team"
							icon={<GroupIcon />}
							sx={{
								"&:hover": {
									bgcolor: "action.hover",
								},
							}}
						/>
					)}
				</BottomNavigation>
			</Paper>
		</>
	);
};
