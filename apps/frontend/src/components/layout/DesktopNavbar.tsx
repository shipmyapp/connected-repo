import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { AppBar } from "@connected-repo/ui-mui/navigation/AppBar";
import { Toolbar } from "@connected-repo/ui-mui/navigation/Toolbar";
import { navItems } from "@frontend/configs/nav.config";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";
import { useLocation, useNavigate } from "react-router";
import { NovuInbox } from "../notifications/NovuInbox";
import { SyncBubble } from "./SyncBubble";
import { UserProfileMenu } from "./UserProfileMenu";

export const DesktopNavbar = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const { activeWorkspace } = useWorkspace();

	const isActive = (path: string) => location.pathname === path;
	const teamSettingsPath = activeWorkspace.id
		? `/teams/${activeWorkspace.id}/settings`
		: null;

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
				<Box
					onClick={() => navigate("/dashboard")}
					sx={{
						display: "flex",
						alignItems: "center",
						cursor: "pointer",
						gap: 1,
						mr: 4,
						transition: "transform 0.2s ease-in-out",
						"&:hover": { transform: "scale(1.02)" },
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

				{/* Team indicator — click routes to the team profile page.
				    Switching happens on /profile, not here. */}
				<Box
					onClick={() => teamSettingsPath && navigate(teamSettingsPath)}
					sx={{
						display: "flex",
						alignItems: "center",
						px: 1.5,
						py: 0.75,
						borderRadius: 2,
						cursor: teamSettingsPath ? "pointer" : "default",
						mr: 2,
						"&:hover": teamSettingsPath
							? { bgcolor: "action.hover" }
							: undefined,
					}}
				>
					<Stack direction="row" spacing={1} alignItems="center">
						<Avatar
							sx={{
								width: 28,
								height: 28,
								bgcolor:
									activeWorkspace.type === "personal"
										? "primary.main"
										: "secondary.main",
								fontSize: "0.9rem",
							}}
						>
							{activeWorkspace.name.charAt(0)}
						</Avatar>
						<Typography variant="body2" sx={{ fontWeight: 600 }}>
							{activeWorkspace.name}
						</Typography>
					</Stack>
				</Box>

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
								"&:active": { transform: "translateY(0)" },
							}}
						>
							{item.label}
						</Button>
					))}
				</Box>

				<SyncBubble />
				<NovuInbox />
				<UserProfileMenu />
			</Toolbar>
		</AppBar>
	);
};
