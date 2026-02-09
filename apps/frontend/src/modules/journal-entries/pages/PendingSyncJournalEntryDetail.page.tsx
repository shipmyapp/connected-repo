import { ErrorAlert } from "@connected-repo/ui-mui/components/ErrorAlert";
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { useLocalDbItem } from "@frontend/worker/db/hooks/useLocalDbItem";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { JournalEntryDetailView } from "../components/JournalEntryDetailView";

export default function PendingSyncJournalEntryDetailPage() {
	const { entryId } = useParams<{ entryId: string }>();
	const [isDeleting, setIsDeleting] = useState(false);
	const [isSyncingState, setIsSyncingState] = useState(false);
	const [attachments, setAttachments] = useState<{ url: string; name: string }[]>([]);

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
		return (
			<Container maxWidth="lg" sx={{ py: 4 }}>
				<Alert severity="error">Journal entry not found (it might have been synced already)</Alert>
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
