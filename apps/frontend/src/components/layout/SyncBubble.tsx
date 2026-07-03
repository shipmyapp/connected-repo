import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Badge } from "@connected-repo/ui-mui/data-display/Badge";
import { Tooltip } from "@connected-repo/ui-mui/data-display/Tooltip";
import { IconButton } from "@connected-repo/ui-mui/navigation/IconButton";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import CloudQueueIcon from "@mui/icons-material/CloudQueue";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";
import { useNavigate } from "react-router";
import { useSyncStatus } from "./useSyncStatus";

/**
 * Header sync indicator with four states. Tap online: force a sync
 * cycle. Tap offline / on error: navigate to the sync status page for
 * details. Badge shows total pending count when > 0.
 */
export const SyncBubble = () => {
	const navigate = useNavigate();
	const snap = useSyncStatus();

	const pending = snap.pendingEntries + snap.pendingFiles;
	const errors = snap.errorEntries + snap.errorFiles;

	// Badge semantics — errors are the more urgent signal, so they win
	// the badge slot when both are non-zero (colour also flips to red).
	// Otherwise show pending. Fixes the "5 on the bubble but 1 error in
	// the detail row" confusion where pending and error counts were
	// mixed on the header but suppressed each other in the details.
	const badgeCount = errors > 0 ? errors : pending;
	const badgeIsError = errors > 0;

	const iconFor = () => {
		if (snap.status === "offline") return <CloudOffIcon fontSize="small" />;
		if (snap.status === "syncing") return <CloudSyncIcon fontSize="small" />;
		if (snap.status === "error") return <SyncProblemIcon fontSize="small" />;
		if (snap.status === "pending") return <CloudQueueIcon fontSize="small" />;
		return <CloudDoneIcon fontSize="small" />;
	};

	const colorFor = () => {
		if (snap.status === "offline") return "text.secondary";
		if (snap.status === "error") return "error.main";
		if (snap.status === "syncing") return "primary.main";
		if (snap.status === "pending") return "warning.main";
		return "success.main";
	};

	const tooltipFor = () => {
		if (snap.status === "offline") return "Offline — tap for sync status";
		if (snap.status === "syncing") return "Syncing…";
		if (errors > 0 && pending > 0) {
			return `${errors} error${errors === 1 ? "" : "s"} · ${pending} pending — tap for details`;
		}
		if (errors > 0) return `${errors} sync error${errors === 1 ? "" : "s"} — tap for details`;
		if (pending > 0) return `${pending} pending — tap to sync now`;
		return "Up to date — tap to sync";
	};

	const handleClick = async () => {
		if (snap.status === "offline" || snap.status === "error") {
			navigate("/settings/sync");
			return;
		}
		const proxy = await getDataProxy();
		// User-initiated tap — bypass the 2-minute throttle so the sync
		// fires immediately even if a cycle just completed.
		await proxy.sync.processQueue(true);
	};

	return (
		<Tooltip title={tooltipFor()}>
			<IconButton
				onClick={handleClick}
				size="small"
				sx={{
					color: colorFor(),
					"& svg": {
						animation:
							snap.status === "syncing"
								? "spin 2s linear infinite"
								: "none",
					},
					"@keyframes spin": {
						from: { transform: "rotate(0deg)" },
						to: { transform: "rotate(360deg)" },
					},
				}}
			>
				<Badge
					badgeContent={badgeCount}
					color={badgeIsError ? "error" : "primary"}
					max={99}
					invisible={badgeCount === 0}
				>
					<Box sx={{ display: "inline-flex" }}>{iconFor()}</Box>
				</Badge>
			</IconButton>
		</Tooltip>
	);
};
