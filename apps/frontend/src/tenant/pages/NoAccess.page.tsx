import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { DEFAULT_APP_BRAND } from "@connected-repo/zod-schemas/tenant.utils";
import { useAsksStore } from "@frontend/lib/asks/asks.store";
import { useTenant } from "@frontend/tenant/TenantContext";
import { sharedAppUrl } from "@frontend/tenant/tenant.resolver";
import { authClient } from "@frontend/utils/auth.client";
import { clearAuthCache, getLastLogin } from "@frontend/utils/auth.persistence";
import { unbindPushAccount } from "@frontend/utils/push.utils";
import { signout } from "@frontend/utils/signout.utils";
import { onLogout } from "@frontend/utils/sync-triggers";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useEffect } from "react";

/**
 * Shown on a team host when the signed-in account is not a member of that
 * team (authLoader), or when this device's membership was revoked while
 * open (WorkspaceContext, active-team-wiped). A team host admits members
 * only, so the session is ended on arrival. Google's callback cannot be
 * tied to the host, so this page is where a non-member is stopped. The
 * cookie is shared across `.<root>`, so this also signs them out of the
 * shared app.
 */
export default function NoAccessPage() {
	const { brand } = useTenant();
	const lastLogin = getLastLogin();
	useEffect(() => {
		// This origin must not boot a cached session offline afterwards
		// (tenant.lock.ts), and its header cache + sync triggers stop now.
		clearAuthCache();
		onLogout();
		void Promise.race([unbindPushAccount(), new Promise((resolve) => setTimeout(resolve, 2000))])
			.catch(() => undefined)
			.finally(() => {
				useAsksStore.getState().reset();
				void authClient.signOut().catch(() => undefined);
			});
	}, []);
	const shared = sharedAppUrl();

	return (
		<Box
			sx={{
				minHeight: "100vh",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				bgcolor: "background.default",
				px: 2,
			}}
		>
			<Container maxWidth="sm">
				<Paper
					elevation={0}
					sx={{ p: { xs: 4, sm: 6 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}
				>
					<Stack spacing={3} alignItems="center" textAlign="center">
						<Avatar
							src={brand.logoUrl ?? undefined}
							sx={{ width: 72, height: 72, bgcolor: "primary.main" }}
						>
							<LockOutlinedIcon fontSize="large" />
						</Avatar>
						<Box>
							<Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
								{brand.appName} is private
							</Typography>
							<Typography color="text.secondary">
								{lastLogin?.email ? `${lastLogin.email} isn't` : "Your account isn't"} a member of
								this team, so you have not been signed in here. Ask a team owner or admin to add
								you, then sign in again.
							</Typography>
						</Box>
						<Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ width: "100%" }}>
							<Button
								variant="contained"
								fullWidth
								onClick={() => void signout("clear-cache")}
								sx={{ minHeight: 44 }}
							>
								Back to sign in
							</Button>
							{shared && (
								<Button variant="outlined" fullWidth href={shared} sx={{ minHeight: 44 }}>
									Open {DEFAULT_APP_BRAND.appName}
								</Button>
							)}
						</Stack>
					</Stack>
				</Paper>
			</Container>
		</Box>
	);
}
