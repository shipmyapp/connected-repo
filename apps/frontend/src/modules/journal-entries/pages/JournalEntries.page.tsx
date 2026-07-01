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
import { JournalEntryCardView } from "@frontend/components/JournalEntryCardView";
import { JournalEntryTableView } from "@frontend/components/JournalEntryTableView";
import { useActiveTeamId } from "@frontend/contexts/WorkspaceContext";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { useNavigate } from "react-router";

export type ViewMode = "card" | "table";

export default function JournalEntriesPage() {
	const navigate = useNavigate();
	const [viewMode, setViewMode] = useState<ViewMode>("card");
	const teamId = useActiveTeamId();

	const { data: entries = [], isLoading } = useQuery(
		orpc.journalEntries.getAll.queryOptions({ input: { teamId } }),
	);

	const totalCount = entries.length;

	const handleViewModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: ViewMode | null) => {
		if (newMode !== null) {
			setViewMode(newMode);
		}
	};

	const navigateToDetail = (entryId: string) =>
		navigate(teamId ? `/teams/${teamId}/journal-entries/${entryId}` : `/journal-entries/${entryId}`);

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
		<Container maxWidth="xl" sx={{ p: 0 }}>
			<Box sx={{ mb: 3, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 3 }}>
				<Box>
					<Typography
						variant="h2"
						component="h1"
						sx={{ fontSize: { xs: "1.75rem", md: "2.25rem" }, fontWeight: 800, mb: 0.5, letterSpacing: "-0.02em" }}
					>
						My Journal
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
						{totalCount} entries in total
					</Typography>
				</Box>

				<Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 0.5 }}>
					<ToggleButtonGroup
						value={viewMode}
						exclusive
						onChange={handleViewModeChange}
						size="small"
						sx={{
							bgcolor: "background.paper",
							borderRadius: 2,
							"& .MuiToggleButton-root": {
								border: "none",
								borderRadius: 2,
								mx: 0.25,
								my: 0.25,
								px: 1,
								"&.Mui-selected": {
									bgcolor: "action.selected",
									color: "primary.main",
								},
							},
						}}
					>
						<ToggleButton value="card">
							<GridViewIcon sx={{ fontSize: 18 }} />
						</ToggleButton>
						<ToggleButton value="table">
							<TableRowsIcon sx={{ fontSize: 18 }} />
						</ToggleButton>
					</ToggleButtonGroup>
				</Stack>
			</Box>

			<Stack spacing={2} key={teamId || "personal"}>
				{viewMode === "card" ? (
					<JournalEntryCardView entries={entries} onEntryClick={navigateToDetail} />
				) : (
					<JournalEntryTableView entries={entries} onEntryClick={navigateToDetail} />
				)}
			</Stack>
		</Container>
	);
}
