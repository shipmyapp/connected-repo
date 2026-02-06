import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Menu } from "@connected-repo/ui-mui/navigation/Menu";
import { MenuItem } from "@connected-repo/ui-mui/form/MenuItem";
import { useTeam } from "@frontend/contexts/TeamContext";
import { Add as AddIcon, KeyboardArrowDown as ArrowDownIcon } from "@mui/icons-material";
import { Divider, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { useState } from "react";
import { CreateTeamModal } from "./CreateTeamModal";

interface TeamSwitcherProps {
    compact?: boolean;
}

export function TeamSwitcher({ compact = false }: TeamSwitcherProps) {
	const { currentTeam, teams, setCurrentTeam } = useTeam();
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const [isCreateModalOpen, setCreateModalOpen] = useState(false);

	const open = Boolean(anchorEl);

	const handleClick = (event: React.MouseEvent<HTMLElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleTeamSelect = (team: typeof teams[number]) => {
		setCurrentTeam(team);
		handleClose();
	};

	const handleCreateClick = () => {
		handleClose();
		setCreateModalOpen(true);
	};

	return (
		<>
			<Button
				onClick={handleClick}
				endIcon={!compact && <ArrowDownIcon />}
				color="inherit"
				sx={{
					textTransform: "none",
					borderRadius: 2,
					px: compact ? 1 : 1.5,
                    mr: 1,
					minWidth: compact ? 'auto' : 140,
					justifyContent: compact ? "center" : "flex-start",
					"&:hover": {
						bgcolor: "action.hover",
					},
				}}
			>
				<Avatar
					src={currentTeam?.logoUrl || undefined}
					alt={currentTeam?.name || "Team"}
					sx={{ 
                        width: 24, 
                        height: 24, 
                        mr: compact ? 0 : 1,
                        bgcolor: "primary.main",
                        fontSize: "0.8rem"
                    }}
				>
					{currentTeam?.name?.charAt(0).toUpperCase() || "T"}
				</Avatar>
				{!compact && (
                    <Typography
                        variant="body2"
                        sx={{
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: 120,
                        }}
                    >
                        {currentTeam?.name || "Select Team"}
                    </Typography>
                )}
			</Button>

			<Menu
				anchorEl={anchorEl}
				open={open}
				onClose={handleClose}
				onClick={handleClose}
				PaperProps={{
					elevation: 0,
					sx: {
						overflow: "visible",
						filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.32))",
						mt: 1.5,
						minWidth: 180,
						"&:before": {
							content: '""',
							display: "block",
							position: "absolute",
							top: 0,
							right: 14,
							width: 10,
							height: 10,
							bgcolor: "background.paper",
							transform: "translateY(-50%) rotate(45deg)",
							zIndex: 0,
						},
					},
				}}
				transformOrigin={{ horizontal: "right", vertical: "top" }}
				anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
			>
                {teams.length > 0 && (
                    <Box sx={{ px: 2, py: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight="bold">
                            TEAMS
                        </Typography>
                    </Box>
                )}
				{teams.map((team) => (
					<MenuItem
						key={team.userTeamId}
						selected={currentTeam?.userTeamId === team.userTeamId}
						onClick={() => handleTeamSelect(team)}
					>
						<Avatar
                            src={team.logoUrl || undefined}
                            alt={team.name}
                            sx={{ width: 20, height: 20, mr: 1.5, fontSize: '0.75rem' }}
                        >
                            {team.name.charAt(0).toUpperCase()}
                        </Avatar>
						<ListItemText primary={team.name} />
					</MenuItem>
				))}
                
                {teams.length > 0 && <Divider />}

				<MenuItem onClick={handleCreateClick}>
					<ListItemIcon>
						<AddIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText primary="Create New Team" />
				</MenuItem>
			</Menu>

			<CreateTeamModal
				open={isCreateModalOpen}
				onClose={() => setCreateModalOpen(false)}
			/>
		</>
	);
}

// Helper Box component since it was undefined in the generated code
function Box(props: any) {
    return <div {...props} />;
}
