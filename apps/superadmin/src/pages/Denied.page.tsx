import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { signOut } from "@superadmin/utils/sign_out";

export default function DeniedPage() {
	return (
		<Box
			sx={{
				minHeight: "100vh",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
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
					maxWidth: 440,
				}}
			>
				<Stack spacing={2} alignItems="center" textAlign="center">
					<LockOutlinedIcon color="disabled" sx={{ fontSize: 48 }} />
					<Typography variant="h5" sx={{ fontWeight: 700 }}>
						Not a super-admin
					</Typography>
					<Typography color="text.secondary">
						You're signed in, but this account isn't on the super-admin allowlist. Ask an operator
						to add it to <code>SUPER_ADMIN_EMAILS</code> and restart the backend.
					</Typography>
					<Button variant="contained" onClick={() => void signOut()} sx={{ minHeight: 44 }}>
						Sign in with another account
					</Button>
				</Stack>
			</Paper>
		</Box>
	);
}
