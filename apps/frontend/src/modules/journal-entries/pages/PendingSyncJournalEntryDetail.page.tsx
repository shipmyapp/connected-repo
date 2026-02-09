import { ErrorAlert } from "@connected-repo/ui-mui/components/ErrorAlert";
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { useLocalDbItem } from "@frontend/worker/db/hooks/useLocalDbItem";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { JournalEntryDetailView } from "../components/JournalEntryDetailView";
import { useActiveTeamId } from "@frontend/contexts/WorkspaceContext";

export default function PendingSyncJournalEntryDetailPage() {
	const navigate = useNavigate();
	const { entryId } = useParams<{ entryId: string }>();
	const activeTeamId = useActiveTeamId();
	const [isDeleting, setIsDeleting] = useState(false);
	const [isSyncingState, setIsSyncingState] = useState(false);
	const [attachments, setAttachments] = useState<{ url: string; name: string }[]>([]);
	const [redirectStatus, setRedirectStatus] = useState<"none" | "checking" | "redirecting" | "error">("none");
	const [debugInfo, setDebugInfo] = useState<string | null>(null);

	const { data: journalEntry, isLoading: entryLoading, error: entryError } = useLocalDbItem(
		"pendingSyncJournalEntries",
		() => getDataProxy().pendingSyncJournalEntriesDb.get(entryId || "")
	);

	// Fetch local files for the pending sync
	useEffect(() => {
		let active = true;
		const trackedUrls = new Set<string>();

		const createUrl = (blob: Blob) => {
			const url = URL.createObjectURL(blob);
			trackedUrls.add(url);
			return url;
		};

		const fetchFiles = async () => {
			if (!entryId) return;
			try {
				const files = await getDataProxy().filesDb.getFilesByPendingSyncId(entryId);
				if (!active) return;
				
				const mapped = files.map(file => {
					const isMedia = file.mimeType.startsWith("image/") || file.mimeType === "application/pdf" || file.mimeType.startsWith("video/");
					
					return {
						url: createUrl(file.blob),
						thumbnailUrl: file.thumbnailBlob ? createUrl(file.thumbnailBlob) : (isMedia ? "not-available" as const : undefined),
						name: file.fileName
					};
				});
				
				setAttachments(mapped);
			} catch (err) {
				console.error("[PendingSyncDetail] Error fetching local files:", err);
			}
		};

		fetchFiles();

		return () => {
			active = false;
			trackedUrls.forEach(url => URL.revokeObjectURL(url));
		};
	}, [entryId]);

	// Detect if entry has been synced when it disappears from pending
	useEffect(() => {
		if (!entryLoading && !journalEntry && redirectStatus === "none" && entryId) {
			const checkSynced = async () => {
				setRedirectStatus("checking");
				// Wait a tiny bit for the worker to finish the transaction (though indexedDB is ACID, React state might lag)
				await new Promise(resolve => setTimeout(resolve, 500));
				
				try {
					const syncedEntry = await getDataProxy().journalEntriesDb.getById(entryId);
					if (syncedEntry) {
						setRedirectStatus("redirecting");
						setTimeout(() => {
							navigate(`/journal-entries/synced/${entryId}`, { replace: true });
						}, 2000);
					} else {
						setRedirectStatus("error");
						setDebugInfo(`Entry ID: ${entryId}, Workspace: ${activeTeamId || 'Personal'}`);
					}
				} catch (err) {
					setRedirectStatus("error");
					setDebugInfo(`Error verifying sync status: ${err instanceof Error ? err.message : 'Unknown error'}`);
				}
			};
			checkSynced();
		}
	}, [journalEntry, entryLoading, entryId, navigate, redirectStatus, activeTeamId]);

	const handleRetry = async () => {
		if (entryId) {
			try {
				setIsSyncingState(true);
				await getDataProxy().sync.processQueue(true);
			} catch (err) {
				console.error("[PendingSyncDetail] Error retrying sync:", err);
			} finally {
				setIsSyncingState(false);
			}
		}
	};

	const handleDelete = async () => {
		if (entryId) {
			setIsDeleting(true);
			try {
				await getDataProxy().pendingSyncJournalEntriesDb.delete(entryId);
			} finally {
				setIsDeleting(false);
			}
		}
	};

	if (entryLoading) return <LoadingSpinner text="Loading journal entry..." />;

	if (entryError) {
		return (
			<Container maxWidth="lg" sx={{ py: 4 }}>
				<ErrorAlert message={`Error loading journal entry: ${entryError instanceof Error ? entryError.message : 'Unknown error'}`} />
			</Container>
		);
	}

	if (!journalEntry) {
		if (redirectStatus === "checking") {
			return (
				<Container maxWidth="lg" sx={{ py: 8 }}>
					<LoadingSpinner text="The entry seems to have been moved from pending-sync. Checking if it has been synced..." />
				</Container>
			);
		}

		if (redirectStatus === "redirecting") {
			return (
				<Container maxWidth="lg" sx={{ py: 8 }}>
					<Stack spacing={3} alignItems="center">
						<LoadingSpinner text="The entry has been synced! Moving you to the synced entry detail page..." />
						<Alert severity="success">Success! Entry is now secure on the server.</Alert>
					</Stack>
				</Container>
			);
		}

		if (redirectStatus === "error") {
			return (
				<Container maxWidth="lg" sx={{ py: 4 }}>
					<Alert 
						severity="error"
						action={
							<Button color="inherit" size="small" onClick={() => navigate("/journal-entries")}>
								Go Back
							</Button>
						}
					>
						<Typography variant="subtitle1" fontWeight={700}>Sorry! Couldn't find this entry.</Typography>
						<Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
							It might have been deleted or there was an issue during the sync transition.
						</Typography>
						<Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}>
							Debug Info: {debugInfo}
						</Box>
						<Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
							Please report this to your admin if you believe this is a bug.
						</Typography>
					</Alert>
				</Container>
			);
		}

		return (
			<Container maxWidth="lg" sx={{ py: 4 }}>
				<Alert severity="info">Loading entry status...</Alert>
			</Container>
		);
	}

	// Verify workspace context
	const entryTeamId = journalEntry.teamId || null;
	if (entryTeamId !== activeTeamId) {
		return (
			<Container maxWidth="lg" sx={{ py: 4 }}>
				<Alert severity="warning">This pending entry belongs to a different workspace.</Alert>
			</Container>
		);
	}

	return (
		<Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
			<JournalEntryDetailView 
				entry={journalEntry} 
				onDelete={handleDelete} 
				isDeleting={isDeleting}
				attachments={attachments}
				syncError={journalEntry.error}
				errorCount={journalEntry.errorCount}
				status={journalEntry.status}
				onRetry={handleRetry}
				isSyncing={isSyncingState}
			/>
		</Container>
	);
}
