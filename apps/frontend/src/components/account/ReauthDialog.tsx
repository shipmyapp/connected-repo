import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import {
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
} from "@connected-repo/ui-mui/feedback/Dialog";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { useBackCloses } from "@connected-repo/ui-mui/utils/use_back_closes";
import { env } from "@frontend/configs/env.config";
import { authClient } from "@frontend/utils/auth.client";

export type ReauthResume = "delete-account" | "export-data";

/**
 * "Confirm it's you": a sensitive act needs a recent sign-in, and sign-in is
 * Google or Apple, so the person signs in again with their provider and
 * comes back to the same dialog (`/profile?resume=…`).
 */
export function ReauthDialog({
	open,
	providers,
	resume,
	onClose,
}: {
	open: boolean;
	providers: string[];
	resume: ReauthResume;
	onClose: () => void;
}) {
	useBackCloses(open, onClose);
	const callbackURL = `${env.VITE_USER_APP_URL || window.location.origin}/profile?resume=${resume}`;
	const hasGoogle = providers.includes("google");
	const hasApple = providers.some((p) => p.startsWith("apple"));
	const signInWith = (provider: "google" | "apple") =>
		void authClient.signIn.social({ provider, callbackURL });

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
			<DialogTitle sx={{ fontWeight: 700 }}>Confirm it's you</DialogTitle>
			<DialogContent>
				<Typography color="text.secondary">
					{hasGoogle || hasApple
						? "For your safety, sign in again before this. You'll come back here."
						: "For your safety, sign in again before this. Sign out and sign in again, then try once more."}
				</Typography>
				<Stack spacing={1} sx={{ mt: 2 }}>
					{hasGoogle && (
						<Button variant="contained" onClick={() => signInWith("google")}>
							Continue with Google
						</Button>
					)}
					{hasApple && (
						<Button variant="contained" onClick={() => signInWith("apple")}>
							Continue with Apple
						</Button>
					)}
				</Stack>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={onClose} color="inherit" sx={{ minHeight: 44 }}>
					Cancel
				</Button>
			</DialogActions>
		</Dialog>
	);
}
