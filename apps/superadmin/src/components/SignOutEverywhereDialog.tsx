import { ConfirmDialog } from "@connected-repo/ui-mui/components/ConfirmDialog";
import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { describeError } from "@connected-repo/ui-mui/utils/rpc_errors";
import { orpc } from "@superadmin/utils/orpc.client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

interface SignOutEverywhereDialogProps {
	/** The account to sign out; null keeps the dialog closed. */
	user: { id: string; email: string | null; name: string } | null;
	onClose: () => void;
}

/** Ends every session of one account, with the reason recorded in the audit trail. */
export function SignOutEverywhereDialog({ user, onClose }: SignOutEverywhereDialogProps) {
	const [reason, setReason] = useState("");
	const queryClient = useQueryClient();
	const revoke = useMutation(
		orpc.revokeUserSessions.mutationOptions({
			onSuccess: ({ ended }) => {
				toast.success(`Signed out of ${ended} session${ended === 1 ? "" : "s"}.`);
				void queryClient.invalidateQueries({ queryKey: orpc.auditList.key() });
				close();
			},
		}),
	);
	const close = () => {
		setReason("");
		revoke.reset();
		onClose();
	};
	return (
		<ConfirmDialog
			open={user !== null}
			title="Sign out everywhere?"
			description={
				<Stack spacing={2}>
					<span>
						Ends every session of {user?.email ?? user?.name} on every device. A signed-in device is
						refused at its next request; one that is offline keeps its cached screens until it next
						connects.
					</span>
					<TextField
						label="Reason (kept in the audit trail)"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						required
						fullWidth
						multiline
						minRows={2}
					/>
				</Stack>
			}
			confirmLabel="Sign out everywhere"
			pendingLabel="Signing out…"
			pending={revoke.isPending}
			error={revoke.error ? describeError(revoke.error) : null}
			onClose={close}
			onConfirm={() => user && revoke.mutate({ userId: user.id, reason })}
		/>
	);
}
