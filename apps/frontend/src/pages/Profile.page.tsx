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
import { useSessionInfo } from "@frontend/contexts/UserContext";
import { useSaveThemeSetting } from "@frontend/hooks/useSaveThemeSetting";
import { TeamsCard } from "@frontend/modules/teams/components/TeamsCard";
import { signout } from "@frontend/utils/signout.utils";
import { useState } from "react";

export default function ProfilePage() {
	const { user } = useSessionInfo();
	const [signingOut, setSigningOut] = useState(false);
	const { mode } = useThemeMode();
	const saveThemeSetting = useSaveThemeSetting();

	if (!user) return null;

	return (
		<Container maxWidth="md" sx={{ py: 4 }}>
			<Stack spacing={4}>
				<Box>
					<Typography variant="h3" sx={{ fontWeight: 800 }}>
						Profile & Settings
					</Typography>
					<Typography variant="body1" color="text.secondary">
						Your account, your teams and this device's settings.
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

				<TeamsCard userId={user.id} />

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

				<NotificationSettings />

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

				<AppVersionLabel prefix="OneQ · " />
			</Stack>
		</Container>
	);
}
