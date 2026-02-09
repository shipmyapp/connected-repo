import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { Button } from "@connected-repo/ui-mui/form/Button";
import SettingsIcon from "@mui/icons-material/Settings";
import React, { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";
import { SyncedEntriesList } from "../../journal-entries/components/SyncedEntriesList.journal-entries";
import { ToggleButton } from "@connected-repo/ui-mui/form/ToggleButton";
import { ToggleButtonGroup } from "@connected-repo/ui-mui/form/ToggleButtonGroup";
import { GridViewIcon } from "@connected-repo/ui-mui/icons/GridViewIcon";
import { TableRowsIcon } from "@connected-repo/ui-mui/icons/TableRowsIcon";

export default function TeamDetailsPage() {
	const navigate = useNavigate();
	const { teamId } = useParams<{ teamId: string }>();
	const { teams, user } = useWorkspace();
	const [viewMode, setViewMode] = useState<"card" | "table">("card");

	const team = teams.find(t => t.teamAppId === teamId);

	if (!teamId || !team) return (
		<Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
			<Typography variant="h4">Team not found</Typography>
			<Button onClick={() => navigate('/dashboard')} sx={{ mt: 2 }}>Back to Dashboard</Button>
		</Container>
	);

	const isOwnerOrAdmin = team.userRole === "Owner" || team.userRole === "Admin";

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
							<ToggleButton value="card"><GridViewIcon sx={{ fontSize: 18 }} /></ToggleButton>
							<ToggleButton value="table"><TableRowsIcon sx={{ fontSize: 18 }} /></ToggleButton>
						</ToggleButtonGroup>
					</Stack>
				</Stack>
			</Box>

			<Stack spacing={4}>
				<SyncedEntriesList viewMode={viewMode} teamId={teamId} excludeUserId={user?.id} />
			</Stack>
		</Container>
	);
}
