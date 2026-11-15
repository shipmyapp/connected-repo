import { ConfirmDialog } from "@connected-repo/ui-mui/components/ConfirmDialog";
import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { describeError } from "@connected-repo/ui-mui/utils/rpc_errors";
import { purgeAfterOf } from "@connected-repo/zod-schemas/account.zod";
import { orpc } from "@superadmin/utils/orpc.client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

export type AccountDeletionAction = "cancel" | "purge";

interface AccountDeletionDialogProps {
	/** The account that asked to be deleted; null keeps the dialog closed. */
	user: {
		id: string;
		email: string | null;
		name: string;
		deletionRequestedAt: number | null;
	} | null;
	action: AccountDeletionAction;
	onClose: () => void;
}

/**
 * Keep an account that asked to be deleted, or delete it now, with the
 * reason recorded in the audit trail. Operators never start a deletion.
 */
export function AccountDeletionDialog({ user, action, onClose }: AccountDeletionDialogProps) {
	const [reason, setReason] = useState("");
	const queryClient = useQueryClient();
	const done = (message: string) => {
		toast.success(message);
		void queryClient.invalidateQueries({ queryKey: orpc.listUsers.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.auditList.key() });
		close();
	};
	const keep = useMutation(
		orpc.cancelAccountDeletion.mutationOptions({ onSuccess: () => done("Account kept.") }),
	);
	const purge = useMutation(
		orpc.purgeAccountNow.mutationOptions({ onSuccess: () => done("Account deleted.") }),
	);
	const mutation = action === "cancel" ? keep : purge;
	const close = () => {
		setReason("");
		keep.reset();
		purge.reset();
		onClose();
	};
	const who = user?.email ?? user?.name;
	const purgeDate =
		user?.deletionRequestedAt != null
			? new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
					purgeAfterOf(user.deletionRequestedAt),
				)
			: "";
	return (
		<ConfirmDialog
			open={user !== null}
			title={action === "cancel" ? "Keep this account?" : "Delete this account now?"}
			description={
				<Stack spacing={2}>
					<span>
						{action === "cancel"
							? `Clears the deletion request of ${who}. They can sign in and use the app at once.`
							: `Deletes ${who} and everything in it now instead of on ${purgeDate}. This can't be undone.`}
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
			confirmLabel={action === "cancel" ? "Keep account" : "Delete now"}
			pending={mutation.isPending}
			error={mutation.error ? describeError(mutation.error) : null}
			onClose={close}
			onConfirm={() => user && mutation.mutate({ userId: user.id, reason })}
		/>
	);
}
