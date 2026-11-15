import {
	List,
	ListItemButton,
	ListItemIcon,
	ListItemText,
} from "@connected-repo/ui-mui/data-display/List";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { AppBar } from "@connected-repo/ui-mui/navigation/AppBar";
import { IconButton } from "@connected-repo/ui-mui/navigation/IconButton";
import { Toolbar } from "@connected-repo/ui-mui/navigation/Toolbar";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import PeopleOutline from "@mui/icons-material/PeopleOutline";
import Drawer from "@mui/material/Drawer";
import type { AdminSession } from "@superadmin/utils/admin.loader";
import { signOut } from "@superadmin/utils/sign_out";
import { useState } from "react";
import { NavLink, Outlet, useLoaderData, useLocation } from "react-router";

const DRAWER_WIDTH = 232;

const NAV_ITEMS = [
	{ to: "/teams", label: "Teams", Icon: GroupsOutlined },
	{ to: "/users", label: "Users", Icon: PeopleOutline },
	{ to: "/flags", label: "Feature flags", Icon: FlagOutlined },
	{ to: "/audit", label: "Audit", Icon: HistoryOutlined },
] as const;

const NavList = ({ onNavigate }: { onNavigate?: () => void }) => {
	const { pathname } = useLocation();
	return (
		<List component="nav" aria-label="Console sections" sx={{ px: 1 }}>
			{NAV_ITEMS.map(({ to, label, Icon }) => (
				<ListItemButton
					key={to}
					component={NavLink}
					to={to}
					selected={pathname === to || pathname.startsWith(`${to}/`)}
					onClick={onNavigate}
					sx={{ borderRadius: 2, minHeight: 44, mb: 0.5 }}
				>
					<ListItemIcon sx={{ minWidth: 36 }}>
						<Icon fontSize="small" />
					</ListItemIcon>
					<ListItemText primary={label} />
				</ListItemButton>
			))}
		</List>
	);
};

/** The console's frame: a top bar, the sections on the left (a drawer on a phone), the page. */
export const AdminLayout = () => {
	const { user } = useLoaderData() as AdminSession;
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);

	return (
		<Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
			<AppBar
				position="fixed"
				color="inherit"
				elevation={0}
				sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, borderBottom: 1, borderColor: "divider" }}
			>
				<Toolbar sx={{ gap: 1 }}>
					<IconButton
						edge="start"
						aria-label="Open the sections"
						onClick={() => setIsDrawerOpen(true)}
						sx={{ display: { md: "none" } }}
					>
						<MenuIcon />
					</IconButton>
					<Typography variant="h6" component="span" fontWeight={600} sx={{ flexGrow: 1 }} noWrap>
						OneQ Admin
					</Typography>
					<Typography
						variant="body2"
						color="text.secondary"
						noWrap
						sx={{ display: { xs: "none", sm: "block" }, maxWidth: 260 }}
					>
						{user.email ?? user.name}
					</Typography>
					<Button variant="outlined" size="small" onClick={() => void signOut()}>
						Sign out
					</Button>
				</Toolbar>
			</AppBar>

			<Drawer
				variant="temporary"
				open={isDrawerOpen}
				onClose={() => setIsDrawerOpen(false)}
				ModalProps={{ keepMounted: true }}
				sx={{ display: { md: "none" }, "& .MuiDrawer-paper": { width: DRAWER_WIDTH } }}
			>
				<Toolbar />
				<NavList onNavigate={() => setIsDrawerOpen(false)} />
			</Drawer>
			<Drawer
				variant="permanent"
				sx={{
					display: { xs: "none", md: "block" },
					width: DRAWER_WIDTH,
					flexShrink: 0,
					"& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" },
				}}
			>
				<Toolbar />
				<NavList />
			</Drawer>

			<Box component="main" sx={{ flexGrow: 1, minWidth: 0, px: { xs: 2, md: 4 }, pb: 6 }}>
				<Toolbar />
				<Box sx={{ pt: 3, maxWidth: 1200, mx: "auto" }}>
					<Outlet />
				</Box>
			</Box>
		</Box>
	);
};
