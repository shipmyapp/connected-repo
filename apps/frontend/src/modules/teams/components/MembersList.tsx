import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Chip } from "@mui/material";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Menu, MenuItem, ListItemIcon, Divider } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import PersonIcon from "@mui/icons-material/Person";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { toast } from "react-toastify";
import { TeamAppMemberSelectAll } from "@connected-repo/zod-schemas/team_app.zod";

interface MembersListProps {
	members: TeamAppMemberSelectAll[];
	onUpdate: () => void;
}

export function MembersList({ members, onUpdate }: MembersListProps) {
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const [selectedMember, setSelectedMember] = useState<TeamAppMemberSelectAll | null>(null);

	const removeMutation = useMutation(orpc.teams.removeTeamMember.mutationOptions({
		onSuccess: () => {
			toast.success("Member removed successfully");
			onUpdate();
		}
	}));

	const updateRoleMutation = useMutation(orpc.teams.updateMemberRole.mutationOptions({
		onSuccess: () => {
			toast.success("Role updated successfully");
			onUpdate();
		}
	}));

	const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, member: TeamAppMemberSelectAll) => {
		setAnchorEl(event.currentTarget);
		setSelectedMember(member);
	};

	const handleMenuClose = () => {
		setAnchorEl(null);
		setSelectedMember(null);
	};

	const handleRemove = () => {
		if (selectedMember) {
			removeMutation.mutate({ teamMemberId: selectedMember.teamMemberId });
		}
		handleMenuClose();
	};

	const handleRoleChange = (role: "Owner" | "Admin" | "Member") => {
		if (selectedMember) {
			updateRoleMutation.mutate({ 
				teamMemberId: selectedMember.teamMemberId,
				role 
			});
		}
		handleMenuClose();
	};

	return (
		<TableContainer component={Paper} sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
			<Table>
				<TableHead sx={{ bgcolor: 'action.hover' }}>
					<TableRow>
						<TableCell sx={{ fontWeight: 700 }}>Member</TableCell>
						<TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
						<TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
						<TableCell align="right"></TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{members.map((member) => (
						<TableRow key={member.teamMemberId} hover>
							<TableCell>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
									<Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.875rem' }}>
										{member.email?.charAt(0).toUpperCase()}
									</Avatar>
									<Box>
										<Typography variant="body2" sx={{ fontWeight: 600 }}>
											{member.email}
										</Typography>
										{member.userId && (
											<Typography variant="caption" color="text.secondary">
												Linked to account
											</Typography>
										)}
									</Box>
								</Box>
							</TableCell>
							<TableCell>
								<Chip 
									label={member.role} 
									size="small" 
									color={member.role === 'Owner' ? 'primary' : member.role === 'Admin' ? 'secondary' : 'default'}
									sx={{ fontWeight: 600 }}
								/>
							</TableCell>
							<TableCell>
								{member.joinedAt ? (
									<Chip label="Joined" size="small" color="success" variant="outlined" />
								) : (
									<Chip label="Pending" size="small" color="warning" variant="outlined" />
								)}
							</TableCell>
							<TableCell align="right">
								<IconButton onClick={(e) => handleMenuOpen(e, member)}>
									<MoreVertIcon />
								</IconButton>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

			<Menu
				anchorEl={anchorEl}
				open={Boolean(anchorEl)}
				onClose={handleMenuClose}
			>
				<Typography variant="overline" sx={{ px: 2, py: 0.5, color: 'text.secondary' }}>Change Role</Typography>
				<MenuItem onClick={() => handleRoleChange("Admin")} disabled={selectedMember?.role === "Admin"}>
					<ListItemIcon><VerifiedUserIcon fontSize="small" /></ListItemIcon>
					Make Admin
				</MenuItem>
				<MenuItem onClick={() => handleRoleChange("Member")} disabled={selectedMember?.role === "Member"}>
					<ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
					Make Member
				</MenuItem>
				<Divider />
				<MenuItem onClick={handleRemove} sx={{ color: 'error.main' }}>
					<ListItemIcon><PersonRemoveIcon fontSize="small" color="error" /></ListItemIcon>
					Remove from Team
				</MenuItem>
			</Menu>
		</TableContainer>
	);
}
