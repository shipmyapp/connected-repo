import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { ToggleButton } from "@connected-repo/ui-mui/form/ToggleButton";
import { ToggleButtonGroup } from "@connected-repo/ui-mui/form/ToggleButtonGroup";
import { LogoutIcon } from "@connected-repo/ui-mui/icons/LogoutIcon";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { useThemeMode } from "@connected-repo/ui-mui/theme/ThemeContext";
import type { ThemeSetting } from "@connected-repo/zod-schemas/enums.zod";
import { AppVersionLabel } from "@frontend/components/AppVersionLabel";
import { NotificationSettings } from "@frontend/components/notifications/NotificationSettings";
import { InstallCard } from "@frontend/components/pwa/InstallCard";
import { useSessionInfo } from "@frontend/contexts/UserContext";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";
import { useSaveThemeSetting } from "@frontend/hooks/useSaveThemeSetting";
import { ConnectedAppsCard } from "@frontend/modules/connected-apps/components/ConnectedAppsCard";
import { TeamsCard } from "@frontend/modules/teams/components/TeamsCard";
import { useTenant } from "@frontend/tenant/TenantContext";
import { signout } from "@frontend/utils/signout.utils";
import SettingsIcon from "@mui/icons-material/Settings";
import { useState } from "react";
import { Link as RouterLink } from "react-router";

export default function ProfilePage() {
	const { user } = useSessionInfo();
	const [signingOut, setSigningOut] = useState(false);
	const { mode } = useThemeMode();
	const saveThemeSetting = useSaveThemeSetting();
	const { isTenant, brand } = useTenant();

	if (!user) return null;

	return (
		<Container maxWidth="md" sx={{ py: 4 }}>
			<Stack spacing={4}>
				<Box>
					<Typography variant="h3" sx={{ fontWeight: 800 }}>
						Profile & Settings
					</Typography>
					<Typography variant="body1" color="text.secondary">
						{isTenant
							? `Your ${brand.appName} account and this device's settings.`
							: "Your account, your teams and this device's settings."}
					</Typography>
				</Box>

				<Card sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
					<Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems="center">
						<Avatar
							src={user.image || undefined}
							alt={user.name}
							sx={{ width: 80, height: 80, bgcolor: "primary.main" }}
						>
							{!user.image && (user.name?.charAt(0) || "?")}
						</Avatar>
						<Box sx={{ flexGrow: 1 }}>
							<Typography variant="h5" sx={{ fontWeight: 700 }}>
								{user.name}
							</Typography>
							<Typography variant="body2" color="text.secondary">
								{user.email}
							</Typography>
							{user.phoneNumber && (
								<Typography variant="body2" color="text.secondary">
									{user.phoneNumber}
								</Typography>
							)}
							<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
								Timezone: {user.timezone}
							</Typography>
						</Box>
					</Stack>
				</Card>

				{isTenant ? (
					// A team host is locked to its team (authLoader): no switching, no
					// "New team". One read-only line names the team.
					<TeamSettingsCard />
				) : (
					<TeamsCard userId={user.id} />
				)}

				<Card sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
					<Stack
						direction={{ xs: "column", sm: "row" }}
						justifyContent="space-between"
						alignItems={{ xs: "flex-start", sm: "center" }}
						spacing={2}
					>
						<Box>
							<Typography variant="h6" sx={{ fontWeight: 700 }}>
								Appearance
							</Typography>
							<Typography variant="body2" color="text.secondary">
								Saved to your account. System follows your device's setting.
							</Typography>
						</Box>
						<ToggleButtonGroup
							exclusive
							size="small"
							value={mode}
							onChange={(_, next: ThemeSetting | null) => {
								if (next) void saveThemeSetting(next);
							}}
							aria-label="Theme"
						>
							<ToggleButton value="light">Light</ToggleButton>
							<ToggleButton value="dark">Dark</ToggleButton>
							<ToggleButton value="system">System</ToggleButton>
						</ToggleButtonGroup>
					</Stack>
				</Card>

				<InstallCard />

				<NotificationSettings />

				<ConnectedAppsCard />

				<Card sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
					<Stack
						direction={{ xs: "column", sm: "row" }}
						justifyContent="space-between"
						alignItems={{ xs: "flex-start", sm: "center" }}
						spacing={2}
					>
						<Box>
							<Typography variant="h6" sx={{ fontWeight: 700 }}>
								Sign out
							</Typography>
							<Typography variant="body2" color="text.secondary">
								Signs this device out and removes the offline copy of your account.
							</Typography>
						</Box>
						<Button
							variant="outlined"
							color="error"
							startIcon={<LogoutIcon />}
							disabled={signingOut}
							onClick={() => {
								setSigningOut(true);
								void signout("clear-cache");
							}}
						>
							{signingOut ? "Signing out…" : "Sign out"}
						</Button>
					</Stack>
				</Card>

				<AppVersionLabel prefix={`${brand.appName} · `} />
			</Stack>
		</Container>
	);
}

/** Team host only: the team this host is locked to, and where its members and branding are. */
function TeamSettingsCard() {
	const { activeWorkspace } = useWorkspace();
	if (!activeWorkspace.id) return null;
	return (
		<Card sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
			<Stack
				direction={{ xs: "column", sm: "row" }}
				justifyContent="space-between"
				alignItems={{ xs: "flex-start", sm: "center" }}
				spacing={2}
			>
				<Box sx={{ minWidth: 0 }}>
					<Typography variant="h6" sx={{ fontWeight: 700 }} data-testid="tenant-team-name">
						{activeWorkspace.name}
					</Typography>
					<Typography variant="body2" color="text.secondary">
						You are {activeWorkspace.role}. Members and branding live on the team page.
					</Typography>
				</Box>
				<Button
					component={RouterLink}
					to={`/teams/${activeWorkspace.id}/settings`}
					variant="outlined"
					startIcon={<SettingsIcon />}
					sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
				>
					Team settings
				</Button>
			</Stack>
		</Card>
	);
}
