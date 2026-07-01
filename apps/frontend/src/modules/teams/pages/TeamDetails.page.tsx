import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { ToggleButton } from "@connected-repo/ui-mui/form/ToggleButton";
import { ToggleButtonGroup } from "@connected-repo/ui-mui/form/ToggleButtonGroup";
import { GridViewIcon } from "@connected-repo/ui-mui/icons/GridViewIcon";
import { TableRowsIcon } from "@connected-repo/ui-mui/icons/TableRowsIcon";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { JournalEntryCardView } from "@frontend/components/JournalEntryCardView";
import { JournalEntryTableView } from "@frontend/components/JournalEntryTableView";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import SettingsIcon from "@mui/icons-material/Settings";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

export default function TeamDetailsPage() {
	const navigate = useNavigate();
	const { teamId } = useParams<{ teamId: string }>();
	const { teams, user } = useWorkspace();
	const [viewMode, setViewMode] = useState<"card" | "table">("card");

	const team = teams.find((t) => t.id === teamId);

	// `getAll` is scoped to the caller's active team on the server. If the
	// user hasn't made this team active (via the profile-page selector),
	// the returned entries will be for a different team. The
	// team-mismatch banner below makes that explicit.
	const { data: entries = [], isLoading } = useQuery({
		...orpc.journalEntries.getAll.queryOptions(),
		enabled: !!teamId,
	});

	if (!teamId || !team) {
		return (
			<Container maxWidth="lg" sx={{ py: 8, textAlign: "center" }}>
				<Typography variant="h4">Team not found</Typography>
				<Button onClick={() => navigate("/dashboard")} sx={{ mt: 2 }}>
					Back to Dashboard
				</Button>
			</Container>
		);
	}

	const visibleEntries = user?.id
		? entries.filter((e) => e.authorUserId !== user.id)
		: entries;

	return (
		<Container maxWidth="lg" sx={{ py: 4 }}>
			<Box sx={{ mb: 6 }}>
				<Stack direction="row" justifyContent="space-between" alignItems="center">
					<Box>
						<Typography variant="h3" sx={{ fontWeight: 800 }}>
							{team.name}
						</Typography>
						<Typography variant="body1" color="text.secondary">
							Welcome to your team workspace.
						</Typography>
					</Box>
					<Stack direction="column" spacing={2}>
						<Button
							variant="outlined"
							startIcon={<SettingsIcon />}
							onClick={() => navigate(`/teams/${teamId}/settings`)}
							sx={{ borderRadius: 2 }}
						/>
						<ToggleButtonGroup
							value={viewMode}
							exclusive
							onChange={(_e, val) => val && setViewMode(val)}
							size="small"
						>
							<ToggleButton value="card">
								<GridViewIcon sx={{ fontSize: 18 }} />
							</ToggleButton>
							<ToggleButton value="table">
								<TableRowsIcon sx={{ fontSize: 18 }} />
							</ToggleButton>
						</ToggleButtonGroup>
					</Stack>
				</Stack>
			</Box>

			<Stack spacing={4}>
				{isLoading ? (
					<LoadingSpinner text="Loading team entries..." />
				) : viewMode === "card" ? (
					<JournalEntryCardView
						entries={visibleEntries}
						onEntryClick={(entryId) => navigate(`/journal-entries/${entryId}`)}
					/>
				) : (
					<JournalEntryTableView
						entries={visibleEntries}
						onEntryClick={(entryId) => navigate(`/journal-entries/${entryId}`)}
					/>
				)}
			</Stack>
		</Container>
	);
}
