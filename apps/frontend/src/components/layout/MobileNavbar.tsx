import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { AppBar } from "@connected-repo/ui-mui/navigation/AppBar";
import { BottomNavigation } from "@connected-repo/ui-mui/navigation/BottomNavigation";
import { BottomNavigationAction } from "@connected-repo/ui-mui/navigation/BottomNavigationAction";
import { Toolbar } from "@connected-repo/ui-mui/navigation/Toolbar";
import { ProfileAvatarLink } from "@frontend/components/layout/ProfileAvatarLink";
import { SyncBubble } from "@frontend/components/layout/SyncBubble";
import { NovuInbox } from "@frontend/components/notifications/NovuInbox";
import { navItems } from "@frontend/configs/nav.config";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";
import { useLocation, useNavigate } from "react-router";

export const MobileNavbar = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const { activeWorkspace } = useWorkspace();

	const getBottomNavValue = () => {
		const navIndex = navItems.findIndex((item) => item.path === location.pathname);
		if (navIndex !== -1) return navIndex;
		if (location.pathname === "/profile") return navItems.length;
		return 0;
	};

	const handleBottomNavChange = (_event: React.SyntheticEvent, newValue: number) => {
		if (newValue === navItems.length) {
			navigate("/profile");
			return;
		}
		const item = navItems[newValue];
		if (item) navigate(item.path);
	};

	return (
		<>
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
					<Box
						onClick={() => navigate("/dashboard")}
						sx={{
							display: "flex",
							alignItems: "center",
							cursor: "pointer",
							gap: 1,
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
					</Box>

					{/* The active team's name, as text (switching lives on /profile). */}
					<Typography
						variant="body2"
						color="text.secondary"
						data-testid="active-team-name"
						sx={{
							fontWeight: 600,
							maxWidth: 120,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							display: { xs: "none", sm: "block" },
						}}
					>
						{activeWorkspace.name}
					</Typography>

					<SyncBubble />
					<NovuInbox />
					<ProfileAvatarLink />
				</Toolbar>
			</AppBar>

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
								"& .MuiSvgIcon-root": { transform: "scale(1.1)" },
							},
							"&:active": { transform: "scale(0.95)" },
						},
					}}
				>
					{navItems.map((item) => (
						<BottomNavigationAction
							key={item.path}
							label={item.label}
							icon={item.mobileIcon || item.desktopIcon}
							sx={{ "&:hover": { bgcolor: "action.hover" } }}
						/>
					))}
				</BottomNavigation>
			</Paper>
		</>
	);
};
