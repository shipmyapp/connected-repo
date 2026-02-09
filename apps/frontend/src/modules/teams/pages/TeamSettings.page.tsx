import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { useNavigate, useParams } from "react-router";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useQuery } from "@tanstack/react-query";
import { MembersList } from "../components/MembersList";
import { AddMemberDialog } from "../components/AddMemberDialog";
import { useState } from "react";
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PersonAddIcon from "@mui/icons-material/PersonAdd";

export default function TeamSettingsPage() {
	const { teamId } = useParams<{ teamId: string }>();
	const navigate = useNavigate();
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const { activeWorkspace } = useWorkspace();

	const { data: members, isLoading, refetch } = useQuery(
		orpc.teams.getTeamMembers.queryOptions({
			input: { teamId: teamId! },
		})
	);

	if (isLoading) return <LoadingSpinner text="Loading members..." />;

	const isAdmin = activeWorkspace.role === 'owner' || activeWorkspace.role === 'admin';

	return (
		<Container maxWidth="lg" sx={{ py: 4 }}>
			<Box sx={{ mb: 4 }}>
				<Button 
					startIcon={<ArrowBackIcon />} 
					onClick={() => navigate(-1)}
					sx={{ mb: 2 }}
				>
					Back
				</Button>
				<Stack direction="row" justifyContent="space-between" alignItems="center">
					<Box>
						<Typography variant="h4" fontWeight={800} gutterBottom>
							Team Settings
						</Typography>
						<Typography variant="body1" color="text.secondary">
							Manage members and roles for {activeWorkspace.name}
						</Typography>
					</Box>
					{isAdmin && (
						<Button 
							variant="contained" 
							startIcon={<PersonAddIcon />}
							onClick={() => setIsAddDialogOpen(true)}
						>
							Add Member
						</Button>
					)}
				</Stack>
			</Box>

			<MembersList 
				members={members || []} 
				isAdmin={isAdmin} 
				onUpdate={refetch}
				teamId={teamId!}
			/>

			<AddMemberDialog 
				open={isAddDialogOpen} 
				onClose={() => setIsAddDialogOpen(false)}
				onSuccess={refetch}
				teamId={teamId!}
			/>
		</Container>
	);
}
