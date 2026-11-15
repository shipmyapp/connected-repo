import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { IconButton } from "@connected-repo/ui-mui/navigation/IconButton";
import type { SessionInfo } from "@frontend/contexts/UserContext";
import { Link as RouterLink, useLoaderData, useLocation } from "react-router";

/** The account's picture, a plain link to the profile page (no menu). */
export const ProfileAvatarLink = () => {
	const user = (useLoaderData() as SessionInfo | undefined)?.user;
	const onProfile = useLocation().pathname === "/profile";
	return (
		<IconButton component={RouterLink} to="/profile" size="small" aria-label="Profile and settings">
			<Avatar
				src={user?.image || undefined}
				alt={user?.name || user?.email || "User"}
				sx={{
					width: 40,
					height: 40,
					border: "2px solid",
					borderColor: onProfile ? "primary.main" : "divider",
				}}
			>
				{!user?.image && (user?.name?.[0] || user?.email?.[0] || "U")}
			</Avatar>
		</IconButton>
	);
};
