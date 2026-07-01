import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { useSessionInfo } from "@frontend/contexts/UserContext";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import GroupIcon from "@mui/icons-material/Group";
import PersonIcon from "@mui/icons-material/Person";
import { Chip, Divider } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AddMemberDialog } from "../components/AddMemberDialog";
import { MembersList } from "../components/MembersList";

// This is the "team profile" page. It shows the active team's identity
// (name, logo, personal-team badge) alongside member management. The
// `:teamId` URL param is expected to equal `activeTeamAppId` — the backend
// enforces it via the `x-team-id` header on every child request.
export default function TeamSettingsPage() {
	const navigate = useNavigate();
	const { teamId } = useParams<{ teamId: string }>();
	const { teams, activeWorkspace } = useWorkspace();
	const { user } = useSessionInfo();
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

	const team = teams.find((t) => t.id === teamId);
	const isPersonal = team?.personalTeamForUserId === user?.id;
	const canManage =
		activeWorkspace.role === "Owner" || activeWorkspace.role === "Admin";

	const { data: members = [], isLoading, refetch } = useQuery(
		orpc.teams.getTeamMembers.queryOptions(),
	);

	if (!teamId) return null;

	if (isLoading) {
		return <LoadingSpinner text="Loading team..." />;
	}

	// Show a mismatch banner when the URL team is not the caller's active
	// team — every RPC on this page targets the active team via header, so
	// the data would otherwise be silently wrong.
	if (teamId !== activeWorkspace.id) {
		return (
			<Container maxWidth="md" sx={{ py: 4 }}>
				<Button
					startIcon={<ArrowBackIcon />}
					onClick={() => navigate(-1)}
					sx={{ mb: 2, color: "text.secondary" }}
				>
					Back
				</Button>
				<Card sx={{ p: 4, borderRadius: 2 }}>
					<Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
						Not your active team
					</Typography>
					<Typography color="text.secondary" sx={{ mb: 2 }}>
						You're viewing a team you haven't switched into. Switch
						active team from your profile page to manage it.
					</Typography>
					<Button variant="contained" onClick={() => navigate("/profile")}>
						Go to Profile
					</Button>
				</Card>
			</Container>
		);
	}

	return (
		<Container maxWidth="lg" sx={{ py: 4 }}>
			<Button
				startIcon={<ArrowBackIcon />}
				onClick={() => navigate(-1)}
				sx={{ mb: 2, color: "text.secondary" }}
			>
				Back
			</Button>

			{/* Team identity block */}
			<Card
				sx={{
					p: 3,
					borderRadius: 2,
					border: "1px solid",
					borderColor: "divider",
					mb: 3,
				}}
			>
				<Stack
					direction={{ xs: "column", sm: "row" }}
					spacing={3}
					alignItems={{ xs: "center", sm: "flex-start" }}
				>
					<Avatar
						src={team?.logoUrl || undefined}
						sx={{
							width: 72,
							height: 72,
							bgcolor: isPersonal ? "primary.main" : "secondary.main",
							fontSize: "1.8rem",
						}}
					>
						{team?.logoUrl
							? null
							: isPersonal
								? <PersonIcon fontSize="large" />
								: <GroupIcon fontSize="large" />}
					</Avatar>
					<Box sx={{ flexGrow: 1 }}>
						<Stack direction="row" spacing={1} alignItems="center">
							<Typography variant="h4" sx={{ fontWeight: 800 }}>
								{team?.name || "Team"}
							</Typography>
							{isPersonal && (
								<Chip
									label="Personal"
									size="small"
									color="primary"
									variant="outlined"
								/>
							)}
						</Stack>
						<Typography variant="body2" color="text.secondary">
							{members.length} member{members.length === 1 ? "" : "s"} · You
							are {activeWorkspace.role}
						</Typography>
					</Box>
				</Stack>
			</Card>

			<Divider sx={{ my: 3 }} />

			<Stack
				direction="row"
				justifyContent="space-between"
				alignItems="center"
				sx={{ mb: 2 }}
			>
				<Typography variant="h5" sx={{ fontWeight: 700 }}>
					Members
				</Typography>
				{canManage && (
					<Button
						variant="contained"
						startIcon={<AddIcon />}
						onClick={() => setIsAddDialogOpen(true)}
						sx={{ borderRadius: 2 }}
					>
						Add Member
					</Button>
				)}
			</Stack>

			<MembersList members={members} onUpdate={refetch} />

			<AddMemberDialog
				open={isAddDialogOpen}
				onClose={() => setIsAddDialogOpen(false)}
				onSuccess={refetch}
			/>
		</Container>
	);
}
