import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { ToggleButton } from "@connected-repo/ui-mui/form/ToggleButton";
import { ToggleButtonGroup } from "@connected-repo/ui-mui/form/ToggleButtonGroup";
import { GridViewIcon } from "@connected-repo/ui-mui/icons/GridViewIcon";
import { TableRowsIcon } from "@connected-repo/ui-mui/icons/TableRowsIcon";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { JournalEntriesEmptyState } from "@frontend/components/JournalEntriesEmptyState";
import { getAppProxy } from "@frontend/worker/app.proxy";
import React, { useState } from "react";
import { useNavigate } from "react-router";
import { PendingSyncList } from "../components/PendingSyncList.journal-entries";
import { SyncedEntriesList } from "../components/SyncedEntriesList.journal-entries";
import { useLocalDbValue } from "@frontend/worker/db/hooks/useLocalDbValue";

export type ViewMode = "card" | "table";

export default function JournalEntriesPage() {
	const navigate = useNavigate();
	const [viewMode, setViewMode] = useState<ViewMode>("card");

	// Reactive counts for total count and empty state check
	const { data: synchronizedCount, isLoading: syncLoading } = useLocalDbValue("journalEntries", () => getAppProxy().journalEntriesDb.count(), 0);
	const { data: pendingCount, isLoading: pendingLoading } = useLocalDbValue("pendingSyncJournalEntries", () => getAppProxy().pendingSyncJournalEntriesDb.count(), 0);

	const isLoading = syncLoading || pendingLoading;
	const totalCount = synchronizedCount + pendingCount;

	const handleViewModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: ViewMode | null) => {
		if (newMode !== null) {
			setViewMode(newMode);
		}
	};

	if (isLoading && totalCount === 0) {
		return <LoadingSpinner text="Loading journal entries..." />;
	}

	if (totalCount === 0) {
		return (
			<Container maxWidth="lg" sx={{ py: 4 }}>
				<JournalEntriesEmptyState />
			</Container>
		);
	}

	return (
		<Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
			{/* Header Section */}
			<Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 3 }}>
				<Box>
					<Typography variant="h3" component="h1" sx={{ fontSize: { xs: "2rem", md: "2.5rem" }, fontWeight: 700, mb: 1 }}>
						My Journal
					</Typography>
					<Typography variant="body2" color="text.secondary">
						{totalCount} entries in total
					</Typography>
				</Box>

				<Stack direction="row" spacing={2} alignItems="center">
					<ToggleButtonGroup value={viewMode} exclusive onChange={handleViewModeChange}>
						<ToggleButton value="card"><GridViewIcon sx={{ fontSize: 20 }} /></ToggleButton>
						<ToggleButton value="table"><TableRowsIcon sx={{ fontSize: 20 }} /></ToggleButton>
					</ToggleButtonGroup>
				</Stack>
			</Box>

			<Stack spacing={3}>
				<PendingSyncList 
					viewMode={viewMode} 
				/>
				<SyncedEntriesList 
					viewMode={viewMode} 
				/>
			</Stack>

			<style>{`
				@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
			`}</style>
		</Container>
	);
}