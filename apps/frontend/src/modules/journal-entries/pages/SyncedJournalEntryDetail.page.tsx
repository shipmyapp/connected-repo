import { ErrorAlert } from "@connected-repo/ui-mui/components/ErrorAlert";
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { useLocalDbItem } from "@frontend/worker/db/hooks/useLocalDbItem";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import { useParams } from "react-router";
import { JournalEntryDetailView } from "../components/JournalEntryDetailView";
import { EditJournalEntryDialog } from "../components/EditJournalEntryDialog";
import { useConnectivity } from "@frontend/sw/sse/useConnectivity.sse.sw";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useMutation } from "@tanstack/react-query";
import { useActiveTeamId } from "@frontend/contexts/WorkspaceContext";
import { useState } from "react";
import { toast } from "react-toastify";

export default function SyncedJournalEntryDetailPage() {
	const { entryId } = useParams<{ entryId: string }>();
	const { isServerReachable } = useConnectivity();
	const activeTeamId = useActiveTeamId();
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

	const { data: journalEntry, isLoading, error } = useLocalDbItem(
		"journalEntries",
		() => getDataProxy().journalEntriesDb.getById(entryId || "")
	);

	const deleteMutation = useMutation(orpc.journalEntries.delete.mutationOptions());
	const updateMutation = useMutation(orpc.journalEntries.update.mutationOptions());

	const handleDelete = async () => {
		if (entryId) {
			await deleteMutation.mutateAsync({ journalEntryId: entryId, teamId: activeTeamId });
		}
	};

	const handleEdit = () => {
		setIsEditDialogOpen(true);
	};

	const handleSaveEdit = async (data: { content: string; prompt: string | null }) => {
		if (!entryId) return;
		
		try {
			console.log("[Edit] Saving changes:", data);
			
			// Update on server
			const updatedEntry = await updateMutation.mutateAsync({
				journalEntryId: entryId,
				teamId: activeTeamId,
				...data,
			});
			
			console.log("[Edit] Server response:", updatedEntry);
			
			// Update local IndexedDB with the server response
			if (updatedEntry) {
				console.log("[Edit] Updating local DB with:", updatedEntry);
				await getDataProxy().journalEntriesDb.upsert(updatedEntry);
				console.log("[Edit] Local DB updated successfully");
			} else {
				console.warn("[Edit] No updated entry returned from server");
			}
			
			toast.success("Entry updated successfully");
			setIsEditDialogOpen(false);
		} catch (error) {
			console.error("[Edit] Failed to update entry:", error);
			toast.error("Failed to update entry. Please try again.");
			throw error;
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
				onEdit={handleEdit}
				isDeleting={deleteMutation.isPending}
				canDelete={isServerReachable}
				canEdit={isServerReachable}
				deleteDisabledReason="Deleting synced entries requires an active internet connection."
				editDisabledReason="Editing synced entries requires an active internet connection."
				attachments={attachments}
				status="synced"
			/>
			<EditJournalEntryDialog
				open={isEditDialogOpen}
				onClose={() => setIsEditDialogOpen(false)}
				onSave={handleSaveEdit}
				initialContent={journalEntry.content}
				initialPrompt={journalEntry.prompt}
				isSaving={updateMutation.isPending}
			/>
		</Container>
	);
}
