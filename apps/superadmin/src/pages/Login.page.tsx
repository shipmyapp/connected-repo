import { GoogleIcon } from "@connected-repo/ui-mui/components/GoogleIcon";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { authClient } from "@superadmin/utils/auth.client";
import { useState } from "react";
import { useSearchParams } from "react-router";

export default function LoginPage() {
	const [loading, setLoading] = useState(false);
	const [searchParams] = useSearchParams();
	const error = searchParams.get("error");

	const signIn = async () => {
		setLoading(true);
		try {
			const data = await authClient.signIn.social(
				{
					provider: "google",
					callbackURL: `${window.location.origin}/teams`,
					errorCallbackURL: `${window.location.origin}/login?error=oauth_failed`,
					disableRedirect: true,
				},
				{ throw: true },
			);
			if (data?.url) window.location.href = data.url;
			else setLoading(false);
		} catch (err) {
			console.error("OAuth initiation failed:", err);
			setLoading(false);
		}
	};

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
			<Paper
				elevation={0}
				sx={{
					p: { xs: 4, sm: 6 },
					borderRadius: 3,
					border: "1px solid",
					borderColor: "divider",
					maxWidth: 420,
					width: "100%",
				}}
			>
				<Stack spacing={3} alignItems="center">
					<Box textAlign="center">
						<Typography variant="h4" sx={{ fontWeight: 800, color: "primary.main" }}>
							OneQ Admin
						</Typography>
						<Typography color="text.secondary">Teams, users and feature flags.</Typography>
					</Box>
					{error && (
						<Alert severity="error" sx={{ width: "100%" }}>
							Sign-in failed. Please try again.
						</Alert>
					)}
					<Button
						variant="outlined"
						fullWidth
						onClick={() => void signIn()}
						disabled={loading}
						sx={{ minHeight: 52, borderRadius: 2, fontWeight: 600, gap: 1.5 }}
					>
						<GoogleIcon width={20} height={20} />
						{loading ? "Connecting…" : "Continue with Google"}
					</Button>
					<Typography variant="caption" color="text.disabled" textAlign="center">
						Access is limited to accounts on the super-admin allowlist.
					</Typography>
				</Stack>
			</Paper>
		</Box>
	);
}
