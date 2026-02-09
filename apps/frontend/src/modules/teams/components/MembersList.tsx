import { 
	Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
	Paper, Avatar, IconButton, Chip, Menu, MenuItem, Tooltip 
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useState } from "react";
import { TeamMemberSelectAll, TeamMemberRole } from "@connected-repo/zod-schemas/team.zod";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

interface MembersListProps {
	members: TeamMemberSelectAll[];
	isAdmin: boolean;
	onUpdate: () => void;
	teamId: string;
}

export const MembersList = ({ members, isAdmin, onUpdate, teamId }: MembersListProps) => {
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const [selectedMember, setSelectedMember] = useState<TeamMemberSelectAll | null>(null);

	const removeMutation = useMutation(orpc.teams.removeTeamMember.mutationOptions());
	const updateRoleMutation = useMutation(orpc.teams.updateMemberRole.mutationOptions());

	const handleOpenMenu = (event: React.MouseEvent<HTMLElement>, member: TeamMemberSelectAll) => {
		setAnchorEl(event.currentTarget);
		setSelectedMember(member);
	};

	const handleCloseMenu = () => {
		setAnchorEl(null);
		setSelectedMember(null);
	};

	const handleRemove = async () => {
		if (!selectedMember) return;
		try {
			await removeMutation.mutateAsync({ teamMemberId: selectedMember.teamMemberId });
			toast.success("Member removed");
			onUpdate();
		} catch (err) {
			toast.error("Failed to remove member");
		}
		handleCloseMenu();
	};

	const handleUpdateRole = async (role: TeamMemberRole) => {
		if (!selectedMember) return;
		try {
			await updateRoleMutation.mutateAsync({ teamMemberId: selectedMember.teamMemberId, role });
			toast.success("Role updated");
			onUpdate();
		} catch (err) {
			toast.error("Failed to update role");
		}
		handleCloseMenu();
	};

	return (
		<TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
			<Table>
				<TableHead sx={{ bgcolor: 'action.hover' }}>
					<TableRow>
						<TableCell>Member</TableCell>
						<TableCell>Role</TableCell>
						<TableCell>Status</TableCell>
						{isAdmin && <TableCell align="right">Actions</TableCell>}
					</TableRow>
				</TableHead>
				<TableBody>
					{members.map((member) => (
						<TableRow key={member.teamMemberId}>
							<TableCell sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
								<Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.light' }}>
									{(member.email?.[0] || 'U').toUpperCase()}
								</Avatar>
								{member.email}
							</TableCell>
							<TableCell>
								<Chip 
									label={member.role} 
									size="small" 
									color={member.role === 'owner' ? 'primary' : member.role === 'admin' ? 'secondary' : 'default'}
									variant="outlined"
								/>
							</TableCell>
							<TableCell>
								{member.userId ? (
									<Chip label="Joined" size="small" color="success" variant="filled" />
								) : (
									<Chip label="Pending" size="small" color="warning" variant="filled" />
								)}
							</TableCell>
							{isAdmin && (
								<TableCell align="right">
									<IconButton 
										size="small" 
										onClick={(e) => handleOpenMenu(e, member)}
										disabled={member.role === 'owner'} // Owners cannot be managed here?
									>
										<MoreVertIcon fontSize="small" />
									</IconButton>
								</TableCell>
							)}
						</TableRow>
					))}
				</TableBody>
			</Table>

			<Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleCloseMenu}>
				<MenuItem onClick={() => handleUpdateRole('admin')}>Set as Admin</MenuItem>
				<MenuItem onClick={() => handleUpdateRole('user')}>Set as User</MenuItem>
				<MenuItem onClick={handleRemove} sx={{ color: 'error.main' }}>Remove Member</MenuItem>
			</Menu>
		</TableContainer>
	);
};
