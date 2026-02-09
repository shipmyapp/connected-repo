import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel } from "@mui/material";
import { Button } from "@connected-repo/ui-mui/form/Button";
import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { toast } from "react-toastify";
import { TeamMemberRole } from "@connected-repo/zod-schemas/enums.zod";

interface AddMemberDialogProps {
	open: boolean;
	onClose: () => void;
	onSuccess: () => void;
	teamAppId: string;
}

export function AddMemberDialog({ open, onClose, onSuccess, teamAppId }: AddMemberDialogProps) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<TeamMemberRole>("Member");

	const mutation = useMutation(orpc.teams.addTeamMember.mutationOptions({
		onSuccess: () => {
			toast.success("Invitation sent successfully");
			setEmail("");
			onSuccess();
			onClose();
		}
	}));

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!email) return;
		mutation.mutate({ teamAppId, email, role });
	};

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
			<DialogTitle sx={{ fontWeight: 700 }}>Invite Team Member</DialogTitle>
			<form onSubmit={handleSubmit}>
				<DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
					<TextField
						label="Email Address"
						type="email"
						fullWidth
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						autoFocus
						placeholder="colleague@example.com"
					/>
					<FormControl fullWidth>
						<InputLabel>Role</InputLabel>
						<Select
							value={role}
							label="Role"
							onChange={(e) => setRole(e.target.value as TeamMemberRole)}
						>
							<MenuItem value="Admin">Admin</MenuItem>
							<MenuItem value="Member">Member</MenuItem>
						</Select>
					</FormControl>
				</DialogContent>
				<DialogActions sx={{ p: 3, pt: 0 }}>
					<Button onClick={onClose} color="inherit">Cancel</Button>
					<Button 
						type="submit" 
						variant="contained" 
						disabled={!email || mutation.isPending}
					>
						{mutation.isPending ? "Inviting..." : "Send Invitation"}
					</Button>
				</DialogActions>
			</form>
		</Dialog>
	);
}
