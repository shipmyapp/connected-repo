import { ErrorAlert } from "@connected-repo/ui-mui/components/ErrorAlert";
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { useLocalDbItem } from "@frontend/worker/db/hooks/useLocalDbItem";
import { getAppProxy } from "@frontend/worker/app.proxy";
import { useParams } from "react-router";
import { JournalEntryDetailView } from "../components/JournalEntryDetailView";
import { useConnectivity } from "@frontend/sw/sse/useConnectivity.sse.sw";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useMutation } from "@tanstack/react-query";

export default function SyncedJournalEntryDetailPage() {
	const { entryId } = useParams<{ entryId: string }>();
	const { isServerReachable } = useConnectivity();

	const { data: journalEntry, isLoading, error } = useLocalDbItem(
		"journalEntries",
		() => getAppProxy().journalEntriesDb.getById(entryId || "")
	);

	const deleteMutation = useMutation(orpc.journalEntries.delete.mutationOptions());

	const handleDelete = async () => {
		if (entryId) {
			await deleteMutation.mutateAsync({ journalEntryId: entryId });
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
