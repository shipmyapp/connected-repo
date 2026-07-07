import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Collapse } from "@connected-repo/ui-mui/feedback/Collapse";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { SyncBubble } from "@frontend/components/layout/SyncBubble";
import { useSyncStatus } from "@frontend/components/layout/useSyncStatus";
import { useActiveTeamId } from "@frontend/contexts/WorkspaceContext";
import type { StoredFile } from "@frontend/worker/db/schema.db.types";
import type { StoredJournalEntry } from "@frontend/worker/db/db.manager";
import { useLocalDb } from "@frontend/worker/db/hooks/useLocalDb";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import { downloadBlob, downloadJson, safeFileName } from "@frontend/utils/download.util";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import CloudQueueIcon from "@mui/icons-material/CloudQueue";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";
import { useState } from "react";
import { useNavigate } from "react-router";

/** Serialize a journal entry's rescuable content to a JSON download. */
function downloadEntryJson(row: StoredJournalEntry): void {
	downloadJson(
		{
			id: row.id,
			content: row.content,
			prompt: row.prompt,
			promptId: row.promptId,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			syncError: row.syncError ?? null,
		},
		`entry-${row.id}.json`,
	);
}

/** Read a file's locally-staged blob out of OPFS and save it to the device. */
async function downloadFileBlob(id: string): Promise<boolean> {
	const proxy = await getDataProxy();
	const dl = await proxy.filesDb.readForDownload(id);
	if (!dl) return false;
	downloadBlob(dl.blob, safeFileName(dl.fileName));
	return true;
}

const HERO_ICON_SX = { fontSize: 32 } as const;

function formatRelativeTime(ts: number | null): string {
	if (!ts) return "never";
	const diff = Date.now() - ts;
	if (diff < 60_000) return "just now";
	const mins = Math.floor(diff / 60_000);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	return `${days}d ago`;
}

export default function SettingsSyncPage() {
	const snap = useSyncStatus();
	const teamId = useActiveTeamId();
	const [triggering, setTriggering] = useState(false);
	const [downloadingAll, setDownloadingAll] = useState(false);

	const handleSyncNow = async () => {
		setTriggering(true);
		try {
			const proxy = await getDataProxy();
			await proxy.sync.processQueue(true);
		} finally {
			setTriggering(false);
		}
	};

	// "No data is ever lost" escape hatch: save every un-synced entry (as one
	// JSON snapshot) and every un-synced file blob to the device, so the user
	// can rescue their work even if syncing is permanently broken.
	const hasUnsynced =
		snap.pendingEntries + snap.pendingFiles + snap.errorEntries + snap.errorFiles > 0;

	const handleDownloadAll = async () => {
		if (!teamId) return;
		setDownloadingAll(true);
		try {
			const proxy = await getDataProxy();
			const [pendingEntries, erroredEntries, pendingFiles, erroredFiles] = await Promise.all([
				proxy.journalEntriesDb.getPending(teamId),
				proxy.journalEntriesDb.listErrored(teamId),
				proxy.filesDb.listPending(teamId),
				proxy.filesDb.listErrored(teamId),
			]);

			const entries = new Map<string, StoredJournalEntry>();
			for (const e of [...pendingEntries, ...erroredEntries]) entries.set(e.id, e);
			const files = new Map<string, StoredFile>();
			for (const f of [...pendingFiles, ...erroredFiles]) files.set(f.id, f);

			if (entries.size > 0) {
				downloadJson(
					Array.from(entries.values()).map((e) => ({
						id: e.id,
						content: e.content,
						prompt: e.prompt,
						promptId: e.promptId,
						createdAt: e.createdAt,
						updatedAt: e.updatedAt,
						syncError: e.syncError ?? null,
					})),
					`unsynced-entries-${teamId}.json`,
				);
			}

			// Blobs can't ride inside the JSON, so each gets its own download.
			for (const f of files.values()) {
				await downloadFileBlob(f.id);
				await new Promise((r) => setTimeout(r, 150));
			}
		} finally {
			setDownloadingAll(false);
		}
	};

	const heroIcon = () => {
		if (snap.status === "offline")
			return <CloudOffIcon sx={{ ...HERO_ICON_SX, color: "text.secondary" }} />;
		if (snap.status === "error")
			return <SyncProblemIcon sx={{ ...HERO_ICON_SX, color: "error.main" }} />;
		if (snap.status === "syncing")
			return <CloudSyncIcon sx={{ ...HERO_ICON_SX, color: "primary.main" }} />;
		if (snap.status === "pending")
			return <CloudQueueIcon sx={{ ...HERO_ICON_SX, color: "warning.main" }} />;
		return <CloudDoneIcon sx={{ ...HERO_ICON_SX, color: "success.main" }} />;
	};

	const pendingTotal = snap.pendingEntries + snap.pendingFiles;
	const heroTitle = () => {
		if (snap.status === "offline") return "You're offline";
		if (snap.status === "syncing") return "Syncing…";
		if (snap.status === "error") return "Sync errors";
		if (snap.status === "pending")
			return `${pendingTotal} pending`;
		if (snap.status === "synced") return "Everything's synced";
		return "Ready to sync";
	};

	return (
		<Container maxWidth="md" sx={{ py: 4 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
				<Typography variant="h5" sx={{ fontWeight: 700 }}>
					Sync
				</Typography>
				<SyncBubble />
			</Box>

			<Paper sx={{ p: 3, mb: 3 }}>
				<Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
					{heroIcon()}
					<Box sx={{ flex: 1 }}>
						<Typography variant="h6" sx={{ fontWeight: 600 }}>
							{heroTitle()}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							Last synced {formatRelativeTime(snap.lastCompletedAt)}
							{snap.lastAttemptedAt && snap.lastAttemptedAt !== snap.lastCompletedAt
								? ` · Last attempt ${formatRelativeTime(snap.lastAttemptedAt)}`
								: ""}
						</Typography>
					</Box>
					<Button
						variant="contained"
						onClick={handleSyncNow}
						disabled={
							triggering || snap.status === "offline" || snap.status === "syncing"
						}
					>
						{snap.status === "syncing" ? "Syncing…" : "Sync now"}
					</Button>
				</Box>

				{hasUnsynced && (
					<Box sx={{ mt: 2 }}>
						<Button
							variant="outlined"
							size="small"
							startIcon={<DownloadIcon />}
							onClick={handleDownloadAll}
							disabled={downloadingAll}
						>
							{downloadingAll ? "Preparing…" : "Download un-synced data"}
						</Button>
						<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
							Saves every un-synced entry and file to this device so nothing is lost
							if syncing can't complete.
						</Typography>
					</Box>
				)}

				{snap.lastError && (
					<Alert severity="error" sx={{ mt: 2 }}>
						{snap.lastError}
					</Alert>
				)}
			</Paper>

			<Paper sx={{ p: 3 }}>
				<Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
					Details
				</Typography>
				<Stack spacing={0}>
					<EntryRow teamId={teamId} snap={snap} />
					<FileRow teamId={teamId} snap={snap} />
				</Stack>
			</Paper>
		</Container>
	);
}

// ─── Row + drill-in ───────────────────────────────────────────────────

function statusOf(pending: number, errors: number) {
	if (errors > 0) return "error" as const;
	if (pending > 0) return "pending" as const;
	return "synced" as const;
}

function statusColor(s: "error" | "pending" | "synced"): string {
	return s === "error" ? "error.main" : s === "pending" ? "warning.main" : "success.main";
}

function statusLabel(pending: number, errors: number): string {
	// Show BOTH counts when both are non-zero — the old label hid pending
	// under errors, which made "5 on the bubble but 1 error in details"
	// look like a lie.
	if (errors > 0 && pending > 0) {
		return `${errors} error${errors === 1 ? "" : "s"} · ${pending} pending`;
	}
	if (errors > 0) return `${errors} error${errors === 1 ? "" : "s"}`;
	if (pending > 0) return `${pending} pending`;
	return "up to date";
}

interface RowHeaderProps {
	label: string;
	pending: number;
	errors: number;
	open: boolean;
	onToggle: () => void;
	canExpand: boolean;
}

function RowHeader({ label, pending, errors, open, onToggle, canExpand }: RowHeaderProps) {
	const s = statusOf(pending, errors);
	return (
		<Box
			onClick={canExpand ? onToggle : undefined}
			sx={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				py: 1.5,
				cursor: canExpand ? "pointer" : "default",
				"&:hover": canExpand ? { bgcolor: "action.hover" } : undefined,
				px: 1,
				mx: -1,
				borderRadius: 1,
			}}
		>
			<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
				<Typography variant="body1" sx={{ fontWeight: 500 }}>
					{label}
				</Typography>
				{canExpand ? (open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />) : null}
			</Box>
			<Typography variant="body2" sx={{ color: statusColor(s), fontWeight: 600 }}>
				{statusLabel(pending, errors)}
			</Typography>
		</Box>
	);
}

// ─── Journal-entry error drill-in ─────────────────────────────────────

interface EntryRowProps {
	teamId: string | null;
	snap: ReturnType<typeof useSyncStatus>;
}

function EntryRow({ teamId, snap }: EntryRowProps) {
	const [open, setOpen] = useState(false);
	const { data: pending } = useLocalDb(
		"journalEntries",
		async (proxy) => (teamId ? await proxy.journalEntriesDb.getPending(teamId) : []),
		[teamId],
	);
	const { data: errored } = useLocalDb(
		"journalEntries",
		async (proxy) => (teamId ? await proxy.journalEntriesDb.listErrored(teamId) : []),
		[teamId],
	);
	// Show every un-synced entry — pending (waiting to push) AND errored —
	// deduped, so the user has visibility into (and an action for) each one.
	// A pending entry can also carry an error, so it must appear only once.
	const items = new Map<string, StoredJournalEntry>();
	for (const r of pending ?? []) items.set(r.id, r);
	for (const r of errored ?? []) items.set(r.id, r);
	const rows = Array.from(items.values());
	const canExpand = rows.length > 0;

	return (
		<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
			<RowHeader
				label="Journal entries"
				pending={snap.pendingEntries}
				errors={snap.errorEntries}
				open={open}
				onToggle={() => setOpen((v) => !v)}
				canExpand={canExpand}
			/>
			<Collapse in={open && canExpand}>
				<Stack spacing={1} sx={{ pb: 2 }}>
					{rows.map((row) => (
						<JournalEntryItem key={row.id} row={row} />
					))}
				</Stack>
			</Collapse>
		</Box>
	);
}

function JournalEntryItem({ row }: { row: StoredJournalEntry }) {
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);
	// A row is "server-known" once the server has echoed its createdAt.
	// Discarding a server-known row locally is meaningless — the next
	// pull re-inserts it. Delete must go through the entry detail page,
	// which uses deleteOnlineFirst (server delete + local hard-delete).
	const isPending = row.createdAt == null;
	const hasError = Boolean(row.syncError);

	const handleRetry = async () => {
		setBusy(true);
		try {
			const proxy = await getDataProxy();
			await proxy.journalEntriesDb.retry(row.id);
			await proxy.sync.processQueue(true);
		} finally {
			setBusy(false);
		}
	};
	const handleDiscard = async () => {
		if (
			!confirm(
				"Discard this local entry? This cannot be undone. Download it first if you want to keep it.",
			)
		)
			return;
		setBusy(true);
		try {
			const proxy = await getDataProxy();
			await proxy.journalEntriesDb.hardDelete(row.id);
		} finally {
			setBusy(false);
		}
	};
	const preview = (row.content || "").slice(0, 80) || "(empty entry)";
	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "space-between",
				gap: 2,
				px: 1.5,
				py: 1,
				border: "1px solid",
				borderColor: hasError ? "error.light" : "warning.light",
				borderRadius: 1,
				bgcolor: hasError ? "error.lighter" : "warning.lighter",
			}}
		>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
					{preview}
				</Typography>
				<Typography
					variant="caption"
					color={hasError ? "error.main" : "text.secondary"}
					sx={{ display: "block", mt: 0.5 }}
				>
					{hasError ? row.syncError : "Waiting to sync…"}
				</Typography>
				{!isPending && (
					<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
						Already synced to the server — to remove it, open the entry and use Delete Entry.
					</Typography>
				)}
			</Box>
			<Stack direction="row" spacing={1}>
				{/* Entry text is always rescuable — download works even offline. */}
				<Button
					size="small"
					startIcon={<DownloadIcon />}
					onClick={() => downloadEntryJson(row)}
					disabled={busy}
				>
					Download
				</Button>
				<Button size="small" startIcon={<RefreshIcon />} onClick={handleRetry} disabled={busy}>
					Retry
				</Button>
				{isPending ? (
					<Button
						size="small"
						color="error"
						startIcon={<DeleteOutlineIcon />}
						onClick={handleDiscard}
						disabled={busy}
					>
						Discard
					</Button>
				) : (
					<Button
						size="small"
						onClick={() => navigate(`/journal-entries/${row.id}`)}
						disabled={busy}
					>
						Open
					</Button>
				)}
			</Stack>
		</Box>
	);
}

// ─── File error drill-in ──────────────────────────────────────────────

interface FileRowProps {
	teamId: string | null;
	snap: ReturnType<typeof useSyncStatus>;
}

function FileRow({ teamId, snap }: FileRowProps) {
	const [open, setOpen] = useState(false);
	const { data: errored } = useLocalDb(
		"files",
		async (proxy) => (teamId ? await proxy.filesDb.listErrored(teamId) : []),
		[teamId],
	);
	const { data: pending } = useLocalDb(
		"files",
		async (proxy) => (teamId ? await proxy.filesDb.listPending(teamId) : []),
		[teamId],
	);
	// Files can be pending without a `pushCreates` path (they only leave
	// pending via CDN upload succeeding, exhausting retries, or the
	// Abandon action below). Expand for both error AND pending so the
	// user has a way in.
	const canExpand = (snap.errorFiles ?? 0) > 0 || (snap.pendingFiles ?? 0) > 0;

	return (
		<Box>
			<RowHeader
				label="Files"
				pending={snap.pendingFiles}
				errors={snap.errorFiles}
				open={open}
				onToggle={() => setOpen((v) => !v)}
				canExpand={canExpand}
			/>
			<Collapse in={open && canExpand}>
				<Stack spacing={1} sx={{ pb: 2 }}>
					{(errored ?? []).map((row) => (
						<FileErrorItem key={row.id} row={row} />
					))}
					{(pending ?? []).map((row) => (
						<FilePendingItem key={row.id} row={row} />
					))}
				</Stack>
			</Collapse>
		</Box>
	);
}

function FilePendingItem({ row }: { row: StoredFile }) {
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);
	const isServerKnown = Boolean(row.createdAt);

	const stateLabel = () => {
		if (row.mainUploadState === "pending") return "Waiting to upload…";
		if (row.mainUploadState === "uploading") return "Uploading…";
		if (row.mainUploadState === "uploaded_to_cdn")
			return "Uploaded — waiting to notify server";
		return `State: ${row.mainUploadState}`;
	};

	const handleDownload = async () => {
		setBusy(true);
		try {
			await downloadFileBlob(row.id);
		} finally {
			setBusy(false);
		}
	};

	const handleAbandon = async () => {
		if (
			!confirm(
				`Stop trying to upload "${row.fileName}"? The server will be told the file is unavailable and the local copy is deleted. This cannot be undone — download it first if you want to keep it.`,
			)
		)
			return;
		setBusy(true);
		try {
			const proxy = await getDataProxy();
			await proxy.filesDb.abandonUpload(row.id);
			await proxy.sync.processQueue(true);
		} finally {
			setBusy(false);
		}
	};

	const handleDiscard = async () => {
		if (
			!confirm(
				`Discard "${row.fileName}"? This cannot be undone — download it first if you want to keep it.`,
			)
		)
			return;
		setBusy(true);
		try {
			const proxy = await getDataProxy();
			await proxy.filesDb.hardDelete(row.id);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "space-between",
				gap: 2,
				px: 1.5,
				py: 1,
				border: "1px solid",
				borderColor: "warning.light",
				borderRadius: 1,
				bgcolor: "warning.lighter",
			}}
		>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
					{row.fileName}
				</Typography>
				<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
					{stateLabel()}
				</Typography>
			</Box>
			<Stack direction="row" spacing={1}>
				{/* Rescue the locally-staged blob before any destructive action. */}
				{row.mainOpfsPath && (
					<Button
						size="small"
						startIcon={<DownloadIcon />}
						onClick={handleDownload}
						disabled={busy}
					>
						Download
					</Button>
				)}
				{isServerKnown && row.tableName === "journalEntries" && (
					<Button
						size="small"
						onClick={() => navigate(`/journal-entries/${row.tableId}`)}
						disabled={busy}
					>
						Open entry
					</Button>
				)}
				{isServerKnown ? (
					<Button
						size="small"
						color="warning"
						startIcon={<CancelOutlinedIcon />}
						onClick={handleAbandon}
						disabled={busy}
					>
						Abandon
					</Button>
				) : (
					<Button
						size="small"
						color="error"
						startIcon={<DeleteOutlineIcon />}
						onClick={handleDiscard}
						disabled={busy}
					>
						Discard
					</Button>
				)}
			</Stack>
		</Box>
	);
}

function FileErrorItem({ row }: { row: StoredFile }) {
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);
	// A file's `createdAt` is stamped `0` at upsertLocal and only gets a
	// real value once the parent journal-entry's create/pushCreates
	// echoes back (via mergeFilesFromServer). Truthy createdAt therefore
	// means the server already knows about this row — discarding locally
	// would just get undone by the next pull.
	const isPending = !row.createdAt;
	// A file with no OPFS blob can't be retried on this device — the
	// only recovery is discard (for pending rows) or open the parent
	// entry (for confirmed rows) to re-pick the file.
	const canRetry = Boolean(row.mainOpfsPath) && row.mainUploadState !== "lost";

	// A server-known file whose upload can't complete needs an escape that
	// isn't "retry" (blob may be gone) — Abandon tells the server the blob is
	// unavailable and clears the stuck row. Not offered once the main file is
	// already on the CDN (abandoning then would wrongly mark it lost).
	const canAbandon =
		!isPending &&
		row.mainUploadState !== "uploaded" &&
		row.mainUploadState !== "uploaded_to_cdn";

	const handleDownload = async () => {
		setBusy(true);
		try {
			await downloadFileBlob(row.id);
		} finally {
			setBusy(false);
		}
	};
	const handleRetry = async () => {
		setBusy(true);
		try {
			const proxy = await getDataProxy();
			await proxy.filesDb.retry(row.id);
			await proxy.sync.processQueue(true);
		} finally {
			setBusy(false);
		}
	};
	const handleAbandon = async () => {
		if (
			!confirm(
				`Stop trying to upload "${row.fileName}"? The server will be told the file is unavailable. This cannot be undone — download it first if you want to keep it.`,
			)
		)
			return;
		setBusy(true);
		try {
			const proxy = await getDataProxy();
			await proxy.filesDb.abandonUpload(row.id);
			await proxy.sync.processQueue(true);
		} finally {
			setBusy(false);
		}
	};
	const handleDiscard = async () => {
		if (
			!confirm(
				`Discard "${row.fileName}"? This cannot be undone — download it first if you want to keep it.`,
			)
		)
			return;
		setBusy(true);
		try {
			const proxy = await getDataProxy();
			await proxy.filesDb.hardDelete(row.id);
		} finally {
			setBusy(false);
		}
	};

	const err =
		row.syncError ||
		row.mainLastError ||
		row.thumbnailLastError ||
		(row.mainUploadState === "lost" ? "Source file missing on this device" : null) ||
		(row.mainUploadState === "abandoned" ? "Out of upload retries" : null) ||
		(row.mainUploadState === "failed" ? "Upload failed" : null) ||
		"(unknown error)";

	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "space-between",
				gap: 2,
				px: 1.5,
				py: 1,
				border: "1px solid",
				borderColor: "error.light",
				borderRadius: 1,
				bgcolor: "error.lighter",
			}}
		>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
					{row.fileName}
				</Typography>
				<Typography variant="caption" color="error.main" sx={{ display: "block", mt: 0.5 }}>
					{err}
				</Typography>
				{!isPending && (
					<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
						Already synced to the server — to remove it, open the entry and delete the whole entry.
					</Typography>
				)}
			</Box>
			<Stack direction="row" spacing={1}>
				{/* Rescue the locally-staged blob before any destructive action. */}
				{row.mainOpfsPath && (
					<Button
						size="small"
						startIcon={<DownloadIcon />}
						onClick={handleDownload}
						disabled={busy}
					>
						Download
					</Button>
				)}
				{canRetry && (
					<Button size="small" startIcon={<RefreshIcon />} onClick={handleRetry} disabled={busy}>
						Retry
					</Button>
				)}
				{isPending ? (
					<Button
						size="small"
						color="error"
						startIcon={<DeleteOutlineIcon />}
						onClick={handleDiscard}
						disabled={busy}
					>
						Discard
					</Button>
				) : (
					<>
						{row.tableName === "journalEntries" && (
							<Button
								size="small"
								onClick={() => navigate(`/journal-entries/${row.tableId}`)}
								disabled={busy}
							>
								Open entry
							</Button>
						)}
						{/* Guaranteed escape for a stuck server-known upload. */}
						{canAbandon && (
							<Button
								size="small"
								color="warning"
								startIcon={<CancelOutlinedIcon />}
								onClick={handleAbandon}
								disabled={busy}
							>
								Abandon
							</Button>
						)}
					</>
				)}
			</Stack>
		</Box>
	);
}
