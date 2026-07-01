import { ErrorAlert } from "@connected-repo/ui-mui/components/ErrorAlert";
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { useActiveTeamId } from "@frontend/contexts/WorkspaceContext";
import { orpcFetch } from "@frontend/utils/orpc.client";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { JournalEntryDetailView } from "../components/JournalEntryDetailView";

export default function JournalEntryDetailPage() {
	const { entryId } = useParams<{ entryId: string }>();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const activeTeamId = useActiveTeamId();

	const {
		data: journalEntry,
		isLoading,
		error,
	} = useQuery({
		...orpc.journalEntries.getById.queryOptions({
			input: { id: entryId || "", teamId: activeTeamId },
		}),
		enabled: !!entryId,
	});

	const { data: files = [] } = useQuery({
		...orpc.files.getByTableId.queryOptions({
			input: { tableName: "journalEntries", tableId: entryId || "" },
		}),
		enabled: !!entryId,
	});

	const attachments = useMemo(
		() =>
			files
				.filter((f) => f.cdnUrl)
				.map((f) => ({
					url: f.cdnUrl as string,
					thumbnailUrl: f.thumbnailCdnUrl ?? undefined,
					name: f.fileName,
				})),
		[files],
	);

	const deleteMutation = useMutation({
		mutationFn: async () => {
			if (!entryId) return;
			await orpcFetch.journalEntries.delete({ id: entryId, teamId: activeTeamId });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.journalEntries.getAll.queryOptions({ input: { teamId: activeTeamId } }).queryKey,
			});
			navigate("/journal-entries", { replace: true });
		},
	});

	if (isLoading) return <LoadingSpinner text="Loading journal entry..." />;

	if (error) {
		return (
			<Container maxWidth="lg" sx={{ py: 4 }}>
				<ErrorAlert
					message={`Error loading journal entry: ${
						error instanceof Error ? error.message : "Unknown error"
					}`}
				/>
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

	// Verify workspace context.
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

	return (
		<Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
			<JournalEntryDetailView
				entry={journalEntry}
				attachments={attachments}
				onDelete={async () => {
					await deleteMutation.mutateAsync();
				}}
				isDeleting={deleteMutation.isPending}
			/>
		</Container>
	);
}
