import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { TeamRowActions } from "@frontend/components/account/TeamRowActions";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";
import CreateTeamDialog from "@frontend/modules/teams/components/CreateTeamDialog";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import GroupIcon from "@mui/icons-material/Group";
import PersonIcon from "@mui/icons-material/Person";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { Chip, Divider } from "@mui/material";
import { useState } from "react";
import { Link as RouterLink } from "react-router";

/**
 * The only place a person switches, creates, leaves or deletes a team. The
 * list is `getMyTeams` (WorkspaceContext); a switch goes through
 * `setActiveTeam`'s gated flow.
 */
export function TeamsCard({ userId }: { userId: string }) {
	const { activeWorkspace, teams, setActiveTeam, isSwitching } = useWorkspace();
	const [createOpen, setCreateOpen] = useState(false);

	const handleSelect = async (teamId: string) => {
		if (teamId === activeWorkspace.id) return;
		await setActiveTeam(teamId);
	};

	const personalTeam = teams.find((t) => t.personalTeamForUserId === userId);
	// Personal team first, then others sorted by joinedAt desc.
	const orderedTeams = [...teams].sort((a, b) => {
		if (a.personalTeamForUserId === userId) return -1;
		if (b.personalTeamForUserId === userId) return 1;
		return (b.joinedAt ?? 0) - (a.joinedAt ?? 0);
	});

	return (
		<Card sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
			<Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
				<Box>
					<Typography variant="h6" sx={{ fontWeight: 700 }}>
						Teams
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Your teams. Every screen shows the active team's data; choose another to switch.
					</Typography>
				</Box>
				<Button
					variant="outlined"
					size="small"
					startIcon={<AddIcon />}
					onClick={() => setCreateOpen(true)}
				>
					New team
				</Button>
			</Stack>

			<Divider sx={{ my: 2 }} />

			<Stack spacing={1}>
				{orderedTeams.map((team) => {
					const isActive = team.id === activeWorkspace.id;
					const isPersonal = team.personalTeamForUserId === userId;
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
								"&:hover": !isSwitching && !isActive ? { bgcolor: "action.hover" } : undefined,
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
							{isActive && (
								<Button
									component={RouterLink}
									to={`/teams/${team.id}/settings`}
									size="small"
									onClick={(e) => e.stopPropagation()}
								>
									Team settings
								</Button>
							)}
							<TeamRowActions
								team={team}
								isActive={isActive}
								personalTeamId={personalTeam?.id ?? null}
							/>
						</Box>
					);
				})}
			</Stack>
			<CreateTeamDialog open={createOpen} onClose={() => setCreateOpen(false)} />
		</Card>
	);
}
