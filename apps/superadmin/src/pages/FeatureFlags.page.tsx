import { ConfirmDialog } from "@connected-repo/ui-mui/components/ConfirmDialog";
import { Chip } from "@connected-repo/ui-mui/data-display/Chip";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
} from "@connected-repo/ui-mui/data-display/Table";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { QueryState } from "@connected-repo/ui-mui/feedback/QueryState";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { FormControlLabel } from "@connected-repo/ui-mui/form/FormControl";
import { Switch } from "@connected-repo/ui-mui/form/Switch";
import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { PageHeader } from "@connected-repo/ui-mui/layout/PageHeader";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { IconButton } from "@connected-repo/ui-mui/navigation/IconButton";
import { describeError } from "@connected-repo/ui-mui/utils/rpc_errors";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { orpc } from "@superadmin/utils/orpc.client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { toast } from "react-toastify";

/** Global kill-switches and per-team overrides (see backend feature_flags.service). */
export default function FeatureFlagsPage() {
	const queryClient = useQueryClient();
	const flags = useQuery(orpc.listFlags.queryOptions({ input: {} }));
	const [key, setKey] = useState("");
	const [scopeId, setScopeId] = useState("");
	const [enabled, setEnabled] = useState(true);
	const [notes, setNotes] = useState("");
	const [deleting, setDeleting] = useState<{ id: string; key: string; scope: string } | null>(null);

	// Every change is also a new audit row.
	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: orpc.listFlags.key() }),
			queryClient.invalidateQueries({ queryKey: orpc.auditList.key() }),
		]);
	const setFlag = useMutation(
		orpc.setFlag.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Flag saved");
				setKey("");
				setScopeId("");
				setNotes("");
			},
			onError: (err) => toast.error(describeError(err)),
		}),
	);
	const deleteFlag = useMutation(
		orpc.deleteFlag.mutationOptions({
			onSuccess: async () => {
				await refresh();
				setDeleting(null);
				toast.success("Flag removed");
			},
			onError: (err) => toast.error(describeError(err)),
		}),
	);

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		const id = scopeId.trim();
		setFlag.mutate({
			key: key.trim(),
			scope: id ? "team" : "global",
			scopeId: id || null,
			enabled,
			notes: notes.trim() || null,
		});
	};

	return (
		<Stack spacing={3}>
			<PageHeader
				title="Feature flags"
				description="A team row overrides the global row for that team. A key nobody set resolves to the default its call site passes (off unless stated)."
			/>

			<Card
				component="form"
				onSubmit={submit}
				sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}
			>
				<Stack
					direction={{ xs: "column", md: "row" }}
					spacing={2}
					alignItems={{ md: "flex-start" }}
				>
					<TextField
						label="Key"
						value={key}
						onChange={(e) => setKey(e.target.value)}
						required
						fullWidth
						placeholder="subscriptions.alert_webhook_enabled"
					/>
					<TextField
						label="Team id (blank = global)"
						value={scopeId}
						onChange={(e) => setScopeId(e.target.value)}
						fullWidth
					/>
					<TextField
						label="Notes"
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						fullWidth
					/>
					<FormControlLabel
						control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
						label="Enabled"
						sx={{ whiteSpace: "nowrap" }}
					/>
					<Button
						type="submit"
						variant="contained"
						disabled={!key.trim() || setFlag.isPending}
						sx={{ minHeight: 44, whiteSpace: "nowrap" }}
					>
						Save flag
					</Button>
				</Stack>
			</Card>

			<QueryState query={flags}>
				{(rows) => (
					<Card
						sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", overflowX: "auto" }}
					>
						<Table size="small">
							<TableHead>
								<TableRow>
									<TableCell>Key</TableCell>
									<TableCell>Scope</TableCell>
									<TableCell>Enabled</TableCell>
									<TableCell>Notes</TableCell>
									<TableCell />
								</TableRow>
							</TableHead>
							<TableBody>
								{rows.length === 0 && (
									<TableRow>
										<TableCell colSpan={5}>
											<Typography color="text.secondary" sx={{ py: 2 }}>
												No flags set.
											</Typography>
										</TableCell>
									</TableRow>
								)}
								{rows.map((f) => (
									<TableRow key={f.id}>
										<TableCell sx={{ fontFamily: "monospace" }}>{f.key}</TableCell>
										<TableCell>
											{f.scope === "global" ? (
												<Chip label="global" size="small" />
											) : (
												<Chip label={f.scopeId} size="small" variant="outlined" />
											)}
										</TableCell>
										<TableCell>
											<Switch
												checked={f.enabled}
												onChange={(e) =>
													setFlag.mutate({
														key: f.key,
														scope: f.scope,
														scopeId: f.scopeId,
														enabled: e.target.checked,
														notes: f.notes,
													})
												}
											/>
										</TableCell>
										<TableCell>{f.notes ?? "—"}</TableCell>
										<TableCell align="right">
											<IconButton
												aria-label="Delete flag"
												color="error"
												onClick={() =>
													setDeleting({
														id: f.id,
														key: f.key,
														scope: f.scope === "global" ? "global" : (f.scopeId ?? ""),
													})
												}
												sx={{ width: 44, height: 44 }}
											>
												<DeleteOutlineIcon fontSize="small" />
											</IconButton>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</Card>
				)}
			</QueryState>
			<ConfirmDialog
				open={!!deleting}
				title={`Delete the flag ${deleting?.key ?? ""}?`}
				description={`The ${deleting?.scope === "global" ? "global" : `team ${deleting?.scope}`} setting goes; whatever reads it falls back to its default at once.`}
				confirmLabel="Delete"
				pendingLabel="Deleting…"
				pending={deleteFlag.isPending}
				onClose={() => setDeleting(null)}
				onConfirm={() => deleting && deleteFlag.mutate({ id: deleting.id })}
			/>
		</Stack>
	);
}
