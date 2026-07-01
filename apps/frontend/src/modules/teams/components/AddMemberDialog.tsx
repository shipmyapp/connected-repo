import { Button } from "@connected-repo/ui-mui/form/Button";
import type { TeamMemberRole } from "@connected-repo/zod-schemas/enums.zod";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, TextField } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { toast } from "react-toastify";

interface AddMemberDialogProps {
	open: boolean;
	onClose: () => void;
	onSuccess: () => void;
}

// `teamId` is derived from the `x-team-id` header on the backend, not sent
// in the body — see teamAppMemberAddInputZod.
export function AddMemberDialog({ open, onClose, onSuccess }: AddMemberDialogProps) {
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
		mutation.mutate({ email, role });
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
