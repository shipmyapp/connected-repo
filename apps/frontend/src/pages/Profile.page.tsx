import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { useSessionInfo } from "@frontend/contexts/UserContext";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";
import CreateTeamDialog from "@frontend/modules/teams/components/CreateTeamDialog";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import GroupIcon from "@mui/icons-material/Group";
import PersonIcon from "@mui/icons-material/Person";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { Chip, Divider } from "@mui/material";
import { useState } from "react";

export default function ProfilePage() {
	const { user } = useSessionInfo();
	const { activeWorkspace, teams, setActiveTeam, isSwitching } = useWorkspace();
	const [createOpen, setCreateOpen] = useState(false);

	if (!user) return null;

	const handleSelect = async (teamId: string) => {
		if (teamId === activeWorkspace.id) return;
		await setActiveTeam(teamId);
	};

	// Personal team first, then others sorted by joinedAt desc.
	const orderedTeams = [...teams].sort((a, b) => {
		if (a.personalTeamForUserId === user.id) return -1;
		if (b.personalTeamForUserId === user.id) return 1;
		return (b.joinedAt ?? 0) - (a.joinedAt ?? 0);
	});

	return (
		<Container maxWidth="md" sx={{ py: 4 }}>
			<Stack spacing={4}>
				<Box>
					<Typography variant="h3" sx={{ fontWeight: 800 }}>
						Profile & Settings
					</Typography>
					<Typography variant="body1" color="text.secondary">
						Manage your account and switch active team.
					</Typography>
				</Box>

				<Card sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
					<Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems="center">
						<Avatar
							src={user.image || undefined}
							alt={user.name}
							sx={{ width: 80, height: 80, bgcolor: "primary.main" }}
						>
							{!user.image && (user.name?.charAt(0) || "?")}
						</Avatar>
						<Box sx={{ flexGrow: 1 }}>
							<Typography variant="h5" sx={{ fontWeight: 700 }}>
								{user.name}
							</Typography>
							<Typography variant="body2" color="text.secondary">
								{user.email}
							</Typography>
							{user.phoneNumber && (
								<Typography variant="body2" color="text.secondary">
									{user.phoneNumber}
								</Typography>
							)}
							<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
								Timezone: {user.timezone}
							</Typography>
						</Box>
					</Stack>
				</Card>

				<Card sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
					<Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
						<Box>
							<Typography variant="h6" sx={{ fontWeight: 700 }}>
								Active Team
							</Typography>
							<Typography variant="body2" color="text.secondary">
								Every request is scoped to this team. Switching updates
								the server and reloads data.
							</Typography>
						</Box>
						<Button
							variant="outlined"
							size="small"
							startIcon={<AddIcon />}
							onClick={() => setCreateOpen(true)}
						>
							New Team
						</Button>
					</Stack>

					<Divider sx={{ my: 2 }} />

					<Stack spacing={1}>
						{orderedTeams.map((team) => {
							const isActive = team.id === activeWorkspace.id;
							const isPersonal = team.personalTeamForUserId === user.id;
							return (
								<Box
									key={team.id}
									onClick={() => !isSwitching && handleSelect(team.id)}
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 2,
										p: 2,
										borderRadius: 2,
										border: "1px solid",
										borderColor: isActive ? "primary.main" : "divider",
										bgcolor: isActive ? "primary.lighter" : "transparent",
										cursor: isSwitching ? "wait" : "pointer",
										opacity: isSwitching && !isActive ? 0.6 : 1,
										transition: "all 0.15s ease-in-out",
										"&:hover": !isSwitching && !isActive
											? { bgcolor: "action.hover" }
											: undefined,
									}}
								>
									{isActive ? (
										<CheckCircleIcon color="primary" />
									) : (
										<RadioButtonUncheckedIcon color="disabled" />
									)}
									<Avatar
										sx={{
											width: 36,
											height: 36,
											bgcolor: isPersonal ? "primary.main" : "secondary.main",
										}}
									>
										{isPersonal ? <PersonIcon fontSize="small" /> : <GroupIcon fontSize="small" />}
									</Avatar>
									<Box sx={{ flexGrow: 1 }}>
										<Stack direction="row" spacing={1} alignItems="center">
											<Typography variant="body1" sx={{ fontWeight: 600 }}>
												{team.name}
											</Typography>
											{isPersonal && (
												<Chip label="Personal" size="small" color="primary" variant="outlined" />
											)}
										</Stack>
										<Typography variant="caption" color="text.secondary">
											{team.userRole}
										</Typography>
									</Box>
								</Box>
							);
						})}
					</Stack>
				</Card>
			</Stack>

			<CreateTeamDialog open={createOpen} onClose={() => setCreateOpen(false)} />
		</Container>
	);
}
