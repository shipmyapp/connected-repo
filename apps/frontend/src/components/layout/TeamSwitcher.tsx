import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { Divider, Menu, MenuItem, ListItemIcon, Button, Box } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import PersonIcon from "@mui/icons-material/Person";
import GroupIcon from "@mui/icons-material/Group";
import SettingsIcon from "@mui/icons-material/Settings";
import AddIcon from "@mui/icons-material/Add";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useWorkspace, Workspace } from "@frontend/contexts/WorkspaceContext";
import CreateTeamDialog from "@frontend/modules/teams/components/CreateTeamDialog";

export default function TeamSwitcher() {
	const navigate = useNavigate();
	const { activeWorkspace, setActiveWorkspace, teams, isLoading, user } = useWorkspace();
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const open = Boolean(anchorEl);

	const handleClick = (event: React.MouseEvent<HTMLElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleSelect = (workspace: Workspace) => {
		setActiveWorkspace(workspace);
		handleClose();
	};

	return (
		<>
			<Button
				onClick={handleClick}
				endIcon={<KeyboardArrowDownIcon />}
				sx={{ 
					textTransform: 'none', 
					color: 'text.primary',
					px: 1.5,
					py: 0.5,
					borderRadius: 2,
					'&:hover': { bgcolor: 'action.hover' }
				}}
			>
				<Stack direction="row" spacing={1} alignItems="center">
					<Avatar 
						sx={{ 
							width: 28, 
							height: 28, 
							bgcolor: activeWorkspace.type === 'personal' ? 'primary.main' : 'secondary.main',
							fontSize: '0.9rem' 
						}}
					>
						{activeWorkspace.name.charAt(0)}
					</Avatar>
					<Typography 
						variant="body2" 
						sx={{ 
							fontWeight: 600,
							display: { xs: 'none', sm: 'block' } // Hide text on very small screens
						}}
					>
						{activeWorkspace.name}
					</Typography>
				</Stack>
			</Button>

			<Menu
				anchorEl={anchorEl}
				open={open}
				onClose={handleClose}
				transformOrigin={{ horizontal: 'right', vertical: 'top' }}
				anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
				PaperProps={{
					sx: {
						mt: 1,
						minWidth: 220,
						boxShadow: '0px 4px 20px rgba(0,0,0,0.1)',
						borderRadius: 2,
						border: '1px solid',
						borderColor: 'divider'
					}
				}}
			>
				<Typography variant="overline" sx={{ px: 2, py: 1, color: 'text.secondary', display: 'block', fontWeight: 700 }}>
					Personal
				</Typography>
				<MenuItem onClick={() => handleSelect({ id: user?.id || 'personal', name: 'Personal Space', type: 'personal', role: 'personal' })}>
					<ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
					Personal Space
				</MenuItem>

				{teams.length > 0 && <Divider sx={{ my: 1 }} />}
				{teams.length > 0 && (
					<Typography variant="overline" sx={{ px: 2, py: 1, color: 'text.secondary', display: 'block', fontWeight: 700 }}>
						Teams
					</Typography>
				)}
				{teams.map((team) => (
					<MenuItem 
						key={team.teamAppId} 
						onClick={() => handleSelect({ id: team.teamAppId, name: team.name, type: 'team', role: team.userRole })}
						selected={activeWorkspace.id === team.teamAppId}
					>
						<ListItemIcon><GroupIcon fontSize="small" /></ListItemIcon>
						<Box sx={{ flexGrow: 1 }}>
							{team.name}
							<Typography variant="caption" display="block" color="text.secondary">
								{team.userRole}
							</Typography>
						</Box>
					</MenuItem>
				))}

				<Divider sx={{ my: 1 }} />

				{activeWorkspace.type === 'team' && (activeWorkspace.role === 'Owner' || activeWorkspace.role === 'Admin') && (
					<MenuItem 
						onClick={() => { 
							navigate(`/teams/${activeWorkspace.id}/settings`); 
							handleClose(); 
						}}
						sx={{ color: 'primary.main' }}
					>
						<ListItemIcon><SettingsIcon fontSize="small" color="primary" /></ListItemIcon>
						Team Settings
					</MenuItem>
				)}

				<MenuItem 
					onClick={() => { 
						setCreateDialogOpen(true);
						handleClose(); 
					}}
					sx={{ color: 'text.secondary' }}
				>
					<ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
					Create New Team
				</MenuItem>
			</Menu>

			<CreateTeamDialog 
				open={createDialogOpen} 
				onClose={() => setCreateDialogOpen(false)} 
			/>
		</>
	);
}
