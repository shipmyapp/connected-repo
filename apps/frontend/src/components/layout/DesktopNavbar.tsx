import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { AppBar } from "@connected-repo/ui-mui/navigation/AppBar";
import { Toolbar } from "@connected-repo/ui-mui/navigation/Toolbar";
import { navItems } from "@frontend/configs/nav.config";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";
import { useLocation, useNavigate } from "react-router";
import { NovuInbox } from "../notifications/NovuInbox";
import { BrandMark } from "./BrandMark";
import { ProfileAvatarLink } from "./ProfileAvatarLink";
import { SyncBubble } from "./SyncBubble";

export const DesktopNavbar = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const { activeWorkspace } = useWorkspace();

	const isActive = (path: string) => location.pathname === path;

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
				<Box sx={{ mr: 4 }}>
					<BrandMark />
				</Box>

				{/* The active team's name, as text: teams are switched, created
				    and configured on /profile only. */}
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ fontWeight: 600, mr: 2 }}
					data-testid="active-team-name"
				>
					{activeWorkspace.name}
				</Typography>

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
								color: isActive(item.path) ? "primary.main" : "text.secondary",
								bgcolor: isActive(item.path) ? "primary.lighter" : "transparent",
								fontWeight: isActive(item.path) ? 600 : 500,
								transition: "all 0.2s ease-in-out",
								"&:hover": {
									bgcolor: isActive(item.path) ? "primary.light" : "action.hover",
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
				<ProfileAvatarLink />
			</Toolbar>
		</AppBar>
	);
};
