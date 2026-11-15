import { ConfirmDialog } from "@connected-repo/ui-mui/components/ConfirmDialog";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import {
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
} from "@connected-repo/ui-mui/feedback/Dialog";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { describeError } from "@connected-repo/ui-mui/utils/rpc_errors";
import { useBackCloses } from "@connected-repo/ui-mui/utils/use_back_closes";
import {
	type AccountDeletionBlocker,
	accountDeletionBlockerZod,
	purgeAfterOf,
} from "@connected-repo/zod-schemas/account.zod";
import { ReauthDialog, type ReauthResume } from "@frontend/components/account/ReauthDialog";
import { useOnlineStatus } from "@frontend/hooks/useOnlineStatus";
import { wipeAllLocalData } from "@frontend/utils/local_data_wipe";
import { orpcFetch } from "@frontend/utils/orpc.client";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { signout } from "@frontend/utils/signout.utils";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "react-toastify";
import { z } from "zod";

/** What a refusal says in `code` and `data`; anything else reads as a plain failure. */
const refusalZod = z.object({ code: z.string(), data: z.unknown() });
const blockersDataZod = z.object({ blockers: z.array(accountDeletionBlockerZod) });
const providersDataZod = z.object({ providers: z.array(z.string()) });

const refusalOf = (error: unknown) => {
	const parsed = refusalZod.safeParse(error);
	return parsed.success ? parsed.data : null;
};

const whatToDo = (b: AccountDeletionBlocker): string => {
	if (b.kind === "personal_team_has_members")
		return "Remove the other people from your personal team";
	if (b.canDelete && b.canLeave) return "Leave it, or delete it";
	if (b.canDelete) return "Hand ownership to another member and leave, or delete the team";
	return "Leave it";
};

function BlockersDialog({
	blockers,
	onClose,
}: {
	blockers: AccountDeletionBlocker[] | null;
	onClose: () => void;
}) {
	const open = blockers !== null;
	useBackCloses(open, onClose);
	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
			<DialogTitle sx={{ fontWeight: 700 }}>Leave your teams first</DialogTitle>
			<DialogContent>
				<Typography color="text.secondary" sx={{ mb: 2 }}>
					Your account can be deleted once you are in no team with other people. Use the team
					actions in the Teams list above.
				</Typography>
				<Stack spacing={1.5} data-testid="deletion-blockers">
					{(blockers ?? []).map((b) => (
						<Box key={b.teamId}>
							<Typography sx={{ fontWeight: 600 }}>
								{b.name} ({b.role})
							</Typography>
							<Typography variant="body2" color="text.secondary">
								{whatToDo(b)}
							</Typography>
						</Box>
					))}
				</Stack>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={onClose} variant="contained" sx={{ minHeight: 44 }}>
					OK
				</Button>
			</DialogActions>
		</Dialog>
	);
}

const downloadJson = (data: unknown) => {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `account-export-${new Date().toISOString().slice(0, 10)}.json`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
};

/** "Your data and account": download a copy, or delete the account. */
export function AccountDataCard() {
	const queryClient = useQueryClient();
	const isOnline = useOnlineStatus();
	const [searchParams, setSearchParams] = useSearchParams();
	const [exporting, setExporting] = useState(false);
	const [checking, setChecking] = useState(false);
	const [blockers, setBlockers] = useState<AccountDeletionBlocker[] | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [reauth, setReauth] = useState<{ resume: ReauthResume; providers: string[] } | null>(null);

	// Back from signing in again: open the same dialog, without acting.
	useEffect(() => {
		const resume = searchParams.get("resume");
		if (resume !== "delete-account" && resume !== "export-data") return;
		if (resume === "delete-account") setConfirmDelete(true);
		else toast.info("You're signed in again. Download your data now.");
		const next = new URLSearchParams(searchParams);
		next.delete("resume");
		setSearchParams(next, { replace: true });
	}, [searchParams, setSearchParams]);

	const askToSignInAgain = (error: unknown, resume: ReauthResume): boolean => {
		const refusal = refusalOf(error);
		if (refusal?.code !== "REAUTH_REQUIRED") return false;
		const data = providersDataZod.safeParse(refusal.data);
		setReauth({ resume, providers: data.success ? data.data.providers : [] });
		return true;
	};

	const exportData = async () => {
		setExporting(true);
		try {
			const data = await orpcFetch.account.exportData(undefined, { context: { noTeam: true } });
			downloadJson(data);
			if (data.truncated.length > 0) {
				toast.info("Some lists were too long for one file; contact support for the rest.");
			}
		} catch (error) {
			if (!askToSignInAgain(error, "export-data")) toast.error(describeError(error));
		} finally {
			setExporting(false);
		}
	};

	const startDelete = async () => {
		setChecking(true);
		try {
			const found = await queryClient.fetchQuery({
				...orpc.account.deletionBlockers.queryOptions(),
				staleTime: 0,
			});
			if (found.length > 0) setBlockers(found);
			else setConfirmDelete(true);
		} catch (error) {
			toast.error(describeError(error));
		} finally {
			setChecking(false);
		}
	};

	const deleteAccount = async () => {
		setDeleting(true);
		setDeleteError(null);
		try {
			await orpcFetch.account.requestDeletion(undefined, { context: { noTeam: true } });
		} catch (error) {
			setDeleting(false);
			if (askToSignInAgain(error, "delete-account")) {
				setConfirmDelete(false);
				return;
			}
			const refusal = refusalOf(error);
			const found = blockersDataZod.safeParse(refusal?.data);
			if (refusal?.code === "LEAVE_TEAMS_FIRST" && found.success) {
				setConfirmDelete(false);
				setBlockers(found.data.blockers);
				return;
			}
			setDeleteError(describeError(error));
			return;
		}
		// Requested: nothing of this account stays on this device, then sign
		// out (the request kept this session, so the sign-out clears its cookies).
		await wipeAllLocalData();
		await signout();
	};

	const purgeDate = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
		purgeAfterOf(Date.now()),
	);

	return (
		<Card
			sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}
			data-testid="account-data-card"
		>
			<Typography variant="h6" sx={{ fontWeight: 700 }}>
				Your data and account
			</Typography>
			<Typography variant="body2" color="text.secondary">
				Download a copy of your data, or delete your account and everything in it.
			</Typography>
			<Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 2 }}>
				<Button
					variant="outlined"
					disabled={!isOnline || exporting}
					onClick={() => void exportData()}
				>
					{exporting ? "Preparing…" : "Download my data"}
				</Button>
				<Button
					variant="outlined"
					color="error"
					disabled={!isOnline || checking}
					onClick={() => void startDelete()}
				>
					Delete my account
				</Button>
			</Stack>
			{!isOnline && (
				<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
					Connect to the internet to download or delete your data.
				</Typography>
			)}
			<BlockersDialog blockers={blockers} onClose={() => setBlockers(null)} />
			<ConfirmDialog
				open={confirmDelete}
				title="Delete your account?"
				description={`Your account, your journal entries and your files will be deleted on ${purgeDate}. Until then you can sign in and keep your account. Everything this app stored on this device is removed now. Download your data first if you want a copy.`}
				confirmLabel="Delete my account"
				pendingLabel="Deleting…"
				pending={deleting}
				error={deleteError}
				onClose={() => {
					setConfirmDelete(false);
					setDeleteError(null);
				}}
				onConfirm={() => void deleteAccount()}
			/>
			{reauth && (
				<ReauthDialog
					open
					providers={reauth.providers}
					resume={reauth.resume}
					onClose={() => setReauth(null)}
				/>
			)}
		</Card>
	);
}
