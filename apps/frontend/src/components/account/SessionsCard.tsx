import { ConfirmDialog } from "@connected-repo/ui-mui/components/ConfirmDialog";
import { When } from "@connected-repo/ui-mui/components/When";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Skeleton } from "@connected-repo/ui-mui/feedback/Skeleton";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Divider } from "@connected-repo/ui-mui/layout/Divider";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { describeError } from "@connected-repo/ui-mui/utils/rpc_errors";
import type { AccountSession } from "@connected-repo/zod-schemas/account.zod";
import { describeSession } from "@frontend/utils/format_session";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

/**
 * "Where you're signed in": the account's sessions (ids only, never a
 * token). Ends OTHER sessions only; this device signs out from the "Sign out"
 * card. Connected AI apps keep their access: they have their own card.
 */
export function SessionsCard() {
	const queryClient = useQueryClient();
	const sessions = useQuery(orpc.account.listSessions.queryOptions());
	const [confirming, setConfirming] = useState<AccountSession | "others" | null>(null);
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.account.listSessions.key() });

	const revokeOne = useMutation(
		orpc.account.revokeSession.mutationOptions({
			onSuccess: async () => {
				setConfirming(null);
				toast.success("Signed out on that device.");
				await refresh();
			},
		}),
	);
	const revokeOthers = useMutation(
		orpc.account.revokeOtherSessions.mutationOptions({
			onSuccess: async ({ ended }) => {
				setConfirming(null);
				toast.success(ended === 1 ? "Signed out on 1 device." : `Signed out on ${ended} devices.`);
				await refresh();
			},
		}),
	);
	const pending = revokeOne.isPending || revokeOthers.isPending;
	const error = revokeOne.error ?? revokeOthers.error;

	const rows = sessions.data ?? [];
	return (
		<Card
			sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}
			data-testid="sessions-card"
		>
			<Typography variant="h6" sx={{ fontWeight: 700 }}>
				Where you're signed in
			</Typography>
			<Typography variant="body2" color="text.secondary">
				Sign out on a device you no longer use. Connected AI apps are managed on their own card.
			</Typography>
			<Divider sx={{ my: 2 }} />
			{sessions.isPending ? (
				<Skeleton variant="rounded" height={56} />
			) : sessions.isError ? (
				<Alert severity="info">Sessions show when you're online.</Alert>
			) : (
				<Stack spacing={1.5}>
					{rows.map((s) => (
						<Stack
							key={s.id}
							direction="row"
							alignItems="center"
							spacing={2}
							data-testid={s.current ? "session-current" : "session-row"}
						>
							<Box sx={{ flexGrow: 1, minWidth: 0 }}>
								<Typography variant="body1" sx={{ fontWeight: 600 }}>
									{s.current ? "This device" : describeSession(s)}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{s.current ? (
										describeSession(s)
									) : (
										<>
											Active <When at={s.lastActiveAt} />
										</>
									)}
								</Typography>
							</Box>
							{!s.current && (
								<Button size="small" color="error" onClick={() => setConfirming(s)}>
									Sign out
								</Button>
							)}
						</Stack>
					))}
					{rows.length > 1 && (
						<Box>
							<Button variant="outlined" color="error" onClick={() => setConfirming("others")}>
								Sign out everywhere else
							</Button>
						</Box>
					)}
				</Stack>
			)}
			<ConfirmDialog
				open={confirming !== null}
				title={confirming === "others" ? "Sign out everywhere else?" : "Sign out on that device?"}
				description={
					confirming === "others"
						? "Every other browser and phone will have to sign in again. This device stays signed in."
						: "It will have to sign in again."
				}
				confirmLabel="Sign out"
				pending={pending}
				error={error ? describeError(error) : null}
				onClose={() => {
					setConfirming(null);
					revokeOne.reset();
					revokeOthers.reset();
				}}
				onConfirm={() => {
					if (confirming === "others") revokeOthers.mutate({});
					else if (confirming) revokeOne.mutate({ sessionId: confirming.id });
				}}
			/>
		</Card>
	);
}
