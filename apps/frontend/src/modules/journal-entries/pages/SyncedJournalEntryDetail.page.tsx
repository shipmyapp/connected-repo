import { ErrorAlert } from "@connected-repo/ui-mui/components/ErrorAlert";
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { useLocalDbItem } from "@frontend/worker/db/hooks/useLocalDbItem";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import { useParams } from "react-router";
import { JournalEntryDetailView } from "../components/JournalEntryDetailView";
import { useConnectivity } from "@frontend/sw/sse/useConnectivity.sse.sw";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useMutation } from "@tanstack/react-query";
import { useActiveTeamId } from "@frontend/contexts/WorkspaceContext";

export default function SyncedJournalEntryDetailPage() {
	const { entryId } = useParams<{ entryId: string }>();
	const { isServerReachable } = useConnectivity();
	const activeTeamId = useActiveTeamId();

	const { data: journalEntry, isLoading, error } = useLocalDbItem(
		"journalEntries",
		() => getDataProxy().journalEntriesDb.getById(entryId || "")
	);

	const deleteMutation = useMutation(orpc.journalEntries.delete.mutationOptions());

	const handleDelete = async () => {
		if (entryId) {
			await deleteMutation.mutateAsync({ journalEntryId: entryId, teamId: activeTeamId });
		}
	};

	if (isLoading) return <LoadingSpinner text="Loading journal entry..." />;

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

	const attachments = (journalEntry.attachmentUrls || []).map((urls, index) => ({
		url: urls[0], // Use original URL
		name: `Attachment ${index + 1}`
	}));

	return (
		<Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
			<JournalEntryDetailView 
				entry={journalEntry} 
				onDelete={handleDelete} 
				isDeleting={deleteMutation.isPending}
				canDelete={isServerReachable}
				deleteDisabledReason="Deleting synced entries requires an active internet connection."
				attachments={attachments}
				status="synced"
			/>
		</Container>
	);
}
