import { 
	Dialog, DialogTitle, DialogContent, DialogActions, 
	TextField, Button, Select, MenuItem, FormControl, InputLabel, Stack 
} from "@mui/material";
import { useState } from "react";
import { TeamMemberRole } from "@connected-repo/zod-schemas/team.zod";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

interface AddMemberDialogProps {
	open: boolean;
	onClose: () => void;
	onSuccess: () => void;
	teamId: string;
}

export const AddMemberDialog = ({ open, onClose, onSuccess, teamId }: AddMemberDialogProps) => {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<TeamMemberRole>("user");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const addMutation = useMutation(orpc.teams.addTeamMember.mutationOptions());

	const handleSubmit = async () => {
		if (!email) return;
		try {
			setIsSubmitting(true);
			await addMutation.mutateAsync({ teamId, email, role });
			toast.success("Member added successfully");
			onSuccess();
			onClose();
			setEmail("");
			setRole("user");
		} catch (err: any) {
			toast.error(err.message || "Failed to add member");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
			<DialogTitle sx={{ fontWeight: 700 }}>Add Team Member</DialogTitle>
			<DialogContent>
				<Stack spacing={3} sx={{ mt: 1 }}>
					<TextField
						label="Email Address"
						fullWidth
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="colleague@example.com"
						autoFocus
					/>
					<FormControl fullWidth>
						<InputLabel>Role</InputLabel>
						<Select
							value={role}
							label="Role"
							onChange={(e) => setRole(e.target.value as TeamMemberRole)}
						>
							<MenuItem value="admin">Admin</MenuItem>
							<MenuItem value="user">User</MenuItem>
						</Select>
					</FormControl>
				</Stack>
			</DialogContent>
			<DialogActions sx={{ p: 3 }}>
				<Button onClick={onClose}>Cancel</Button>
				<Button 
					variant="contained" 
					onClick={handleSubmit} 
					disabled={isSubmitting || !email}
				>
					{isSubmitting ? "Adding..." : "Add Member"}
				</Button>
			</DialogActions>
		</Dialog>
	);
};
