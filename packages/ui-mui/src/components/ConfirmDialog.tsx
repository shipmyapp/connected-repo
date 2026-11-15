import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

export interface ConfirmDialogProps {
	open: boolean;
	title: string;
	/** What happens and what is lost, in a sentence or two. */
	description: ReactNode;
	/** The button that does it, named for the act: "Delete", "Remove", "Stop session". */
	confirmLabel: string;
	/** Shown on the button while the act runs; defaults to `confirmLabel` + "…". */
	pendingLabel?: string;
	pending?: boolean;
	/** The server's sentence when the act failed; the dialog stays open. */
	error?: string | null;
	onClose: () => void;
	onConfirm: () => void;
}

/**
 * The one question every destructive act asks before it runs. Cancel is the
 * default (left, and the dialog cannot be dismissed while the act runs); the
 * act itself is the red button, named for what it does.
 */
export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel,
	pendingLabel,
	pending = false,
	error = null,
	onClose,
	onConfirm,
}: ConfirmDialogProps) {
	return (
		<Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="xs">
			<DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
			<DialogContent>
				<Typography component="div" color="text.secondary">
					{description}
				</Typography>
				{error && (
					<Typography color="error" sx={{ mt: 2 }}>
						{error}
					</Typography>
				)}
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={onClose} color="inherit" disabled={pending} sx={{ minHeight: 44 }}>
					Cancel
				</Button>
				<Button
					onClick={onConfirm}
					variant="contained"
					color="error"
					disabled={pending}
					sx={{ minHeight: 44 }}
				>
					{pending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
