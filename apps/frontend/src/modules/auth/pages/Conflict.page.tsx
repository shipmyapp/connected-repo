import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { ErrorOutlineIcon as WarningIcon } from "@connected-repo/ui-mui/icons/ErrorOutlineIcon";
import { LogoutIcon } from "@connected-repo/ui-mui/icons/LogoutIcon";
import { DeleteIcon as DeleteForeverIcon } from "@connected-repo/ui-mui/icons/DeleteIcon";
import { authClient } from "@frontend/utils/auth.client";
import { dataWorkerClient } from "@frontend/worker/worker.client";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

export const ConflictPage = () => {
	const [isLoading, setIsLoading] = useState(false);
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();

	const newEmail = searchParams.get("newEmail");
	const oldEmail = searchParams.get("oldEmail");

	const handleLogout = async () => {
		setIsLoading(true);
		try {
			await authClient.signOut();
			localStorage.removeItem("connected-repo-session");
			navigate("/auth/login");
		} catch (error) {
			console.error("Logout failed:", error);
			navigate("/auth/login");
		} finally {
			setIsLoading(false);
		}
	};

	const handleDestroyData = async () => {
		if (!window.confirm("ARE YOU SURE? This will permanently delete all unsynced data for " + oldEmail + " on this device.")) {
			return;
		}

		setIsLoading(true);
		try {
			await dataWorkerClient.clearCache();
			const session = await authClient.getSession();
			if (session.data) {
				await dataWorkerClient.updateUserMeta(session.data.user.id, session.data.user.email);
				navigate("/dashboard");
			} else {
				navigate("/auth/login");
			}
		} catch (error) {
			console.error("Data wipe failed:", error);
			// Fallback: try to redirect to dashboard and hope for the best
			navigate("/dashboard");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Box
			sx={{
				minHeight: "100vh",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
				px: 3,
			}}
		>
			<Container maxWidth="sm">
				<Paper
					elevation={3}
					sx={{
						p: { xs: 4, sm: 6 },
						borderRadius: 4,
						textAlign: "center",
					}}
				>
					<Stack spacing={4} alignItems="center">
						<WarningIcon sx={{ fontSize: 64, color: "warning.main" }} />
						
						<Box>
							<Typography variant="h4" fontWeight={700} gutterBottom>
								Data Conflict
							</Typography>
							<Typography variant="body1" color="text.secondary">
								You are logged in as <strong>{newEmail}</strong>, but this device has unsynced data belonging to <strong>{oldEmail}</strong>.
							</Typography>
						</Box>

						<Alert severity="warning" variant="outlined" sx={{ textAlign: "left", width: "100%" }}>
							Continuing will lose any unsynced journals or reflections created by {oldEmail}.
						</Alert>

						<Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ width: "100%" }}>
							<Button
								variant="outlined"
								startIcon={<LogoutIcon />}
								onClick={handleLogout}
								disabled={isLoading}
								fullWidth
								sx={{ py: 1.5 }}
							>
								Sign Out
							</Button>
							<Button
								variant="contained"
								color="error"
								startIcon={<DeleteForeverIcon />}
								onClick={handleDestroyData}
								disabled={isLoading}
								fullWidth
								sx={{ py: 1.5 }}
							>
								Destroy & Continue
							</Button>
						</Stack>

						<Typography variant="caption" color="text.disabled">
							To preserve the data, Sign Out and log back in as {oldEmail} to complete synchronization.
						</Typography>
					</Stack>
				</Paper>
			</Container>
		</Box>
	);
};
