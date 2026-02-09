import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import React, { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { MembersList } from "../components/MembersList";
import { AddMemberDialog } from "../components/AddMemberDialog";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";

export default function TeamSettingsPage() {
	const navigate = useNavigate();
	const { teamId } = useParams<{ teamId: string }>();
	const { teams } = useWorkspace();
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

	const team = teams.find(t => t.teamAppId === teamId);

	const { data: members = [], isLoading, refetch } = useQuery(
		orpc.teams.getTeamMembers.queryOptions({ input: { teamAppId: teamId as string } }),
	);

	if (!teamId) return null;

	if (isLoading) {
		return <LoadingSpinner text="Loading team members..." />;
	}

	return (
		<Container maxWidth="lg" sx={{ py: 4 }}>
			<Box sx={{ mb: 4 }}>
				<Button 
					startIcon={<ArrowBackIcon />} 
					onClick={() => navigate(-1)}
					sx={{ mb: 2, color: 'text.secondary' }}
				>
					Back
				</Button>
				<Stack direction="row" justifyContent="space-between" alignItems="center">
					<Box>
						<Typography variant="h3" sx={{ fontWeight: 800 }}>
							Team Settings
						</Typography>
						<Typography variant="body1" color="text.secondary">
							Manage members and permissions for <strong>{team?.name || 'this team'}</strong>
						</Typography>
					</Box>
					<Button 
						variant="contained" 
						startIcon={<AddIcon />}
						onClick={() => setIsAddDialogOpen(true)}
						sx={{ borderRadius: 2 }}
					>
						Add Member
					</Button>
				</Stack>
			</Box>

			<MembersList 
				members={members} 
				onUpdate={refetch}
			/>

			<AddMemberDialog 
				open={isAddDialogOpen} 
				onClose={() => setIsAddDialogOpen(false)} 
				onSuccess={refetch}
				teamAppId={teamId}
			/>
		</Container>
	);
}
