import { ErrorAlert } from "@connected-repo/ui-mui/components/ErrorAlert";
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { useLocalDbItem } from "@frontend/worker/db/hooks/useLocalDbItem";
import { useLocalDb } from "@frontend/worker/db/hooks/useLocalDb";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import { useState } from "react";
import { useParams } from "react-router";
import { JournalEntryDetailView } from "../components/JournalEntryDetailView";
import { useConnectivity } from "@frontend/sw/sse/useConnectivity.sse.sw";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { useActiveTeamId } from "@frontend/contexts/WorkspaceContext";
import { getOpfsMediaUrl } from "@frontend/utils/file-url.utils";

export default function SyncedJournalEntryDetailPage() {
	const { entryId } = useParams<{ entryId: string }>();
	const [isDeleting, setIsDeleting] = useState(false);
	const { isServerReachable } = useConnectivity();
	const activeTeamId = useActiveTeamId();

	const { data: journalEntry, isLoading, error } = useLocalDbItem(
		"journalEntries",
		(app) => app.journalEntriesDb.getById(entryId || "")
	);

	const { data: files, isLoading: isLoadingFiles } = useLocalDb(
		"files",
		(app) => app.filesDb.getFilesByTableId(entryId),
		[entryId]
	);

	const handleDelete = async () => {
		if (entryId) {
			setIsDeleting(true);
			try {
				await (await getDataProxy()).journalEntriesDb.delete(entryId);
			} finally {
				setIsDeleting(false);
			}
		}
	};

	if (isLoading || isLoadingFiles) return <LoadingSpinner text="Loading journal entry..." />;

	if (error) {
		return (
			<Container maxWidth="lg" sx={{ py: 4 }}>
				<ErrorAlert message={`Error loading journal entry: ${error instanceof Error ? error.message : 'Unknown error'}`} />
			</Container>
		);
	}

	if (!journalEntry) {
		return (
			<Container maxWidth="lg" sx={{ py: 4 }}>
				<Alert severity="error">Journal entry not found</Alert>
			</Container>
		);
	}

	// Verify workspace context
	const entryTeamId = journalEntry.teamId || null;
	if (entryTeamId !== activeTeamId) {
		return (
			<Container maxWidth="lg" sx={{ py: 4 }}>
				<Alert 
					severity="warning" 
					action={
						<Box sx={{ mt: 1 }}>
							<Typography variant="body2" sx={{ mb: 1 }}>
								This entry belongs to a different workspace.
							</Typography>
						</Box>
					}
				>
					Workspace Mismatch
				</Alert>
			</Container>
		);
	}

	const attachments = (files || []).map((file) => ({
		url: (file._opfsPath ? getOpfsMediaUrl(file._opfsPath) : file.cdnUrl) || "",
		name: file.fileName,
        thumbnailUrl: (file._thumbnailOpfsPath ? getOpfsMediaUrl(file._thumbnailOpfsPath) : file.thumbnailCdnUrl) || undefined
	}));

	return (
		<Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
			<JournalEntryDetailView 
				entry={journalEntry} 
				onDelete={handleDelete} 
				isDeleting={isDeleting}
				attachments={attachments}
			/>
		</Container>
	);
}
