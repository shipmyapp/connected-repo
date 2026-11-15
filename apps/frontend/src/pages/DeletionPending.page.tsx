import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { describeError } from "@connected-repo/ui-mui/utils/rpc_errors";
import { purgeAfterOf } from "@connected-repo/zod-schemas/account.zod";
import { useOnlineStatus } from "@frontend/hooks/useOnlineStatus";
import { patchAuthCacheUser } from "@frontend/utils/auth.persistence";
import { orpcFetch } from "@frontend/utils/orpc.client";
import type { sessionOnlyLoader } from "@frontend/utils/session_only.loader";
import { requestFreshSession } from "@frontend/utils/session_refresh.client";
import { signout } from "@frontend/utils/signout.utils";
import { useEffect, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { toast } from "react-toastify";

/** The one page an account scheduled for deletion sees: keep it, or sign out. */
export default function DeletionPendingPage() {
	const { user } = useLoaderData<typeof sessionOnlyLoader>();
	const navigate = useNavigate();
	const isOnline = useOnlineStatus();
	const [keeping, setKeeping] = useState(false);
	const requestedAt = user.deletionRequestedAt;

	useEffect(() => {
		if (requestedAt === null) navigate("/dashboard", { replace: true });
	}, [requestedAt, navigate]);
	if (requestedAt === null) return null;

	const date = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
		purgeAfterOf(requestedAt),
	);

	const keep = async () => {
		setKeeping(true);
		try {
			await orpcFetch.account.cancelDeletion(undefined, { context: { noTeam: true } });
			patchAuthCacheUser({ deletionRequestedAt: null });
			// The session's cookie copy still says "pending" for a few minutes.
			requestFreshSession();
			window.location.assign("/dashboard");
		} catch (error) {
			toast.error(describeError(error));
			setKeeping(false);
		}
	};

	return (
		<Container maxWidth="sm" sx={{ py: 8 }}>
			<Card sx={{ p: 4, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
				<Stack spacing={3}>
					<Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
						Your account is scheduled for deletion
					</Typography>
					<Typography variant="body1" color="text.secondary">
						It will be deleted with everything in it on {date}. Until then you can keep it.
					</Typography>
					{!isOnline && (
						<Typography variant="body2" color="text.secondary">
							Connect to the internet to keep your account.
						</Typography>
					)}
					<Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
						<Button variant="contained" disabled={!isOnline || keeping} onClick={() => void keep()}>
							{keeping ? "Keeping…" : "Keep my account"}
						</Button>
						<Button variant="text" onClick={() => void signout("clear-cache")}>
							Sign out
						</Button>
					</Stack>
				</Stack>
			</Card>
		</Container>
	);
}
