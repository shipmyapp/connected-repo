import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import React, { useState } from "react";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";

interface CreateTeamDialogProps {
	open: boolean;
	onClose: () => void;
}

export default function CreateTeamDialog({ open, onClose }: CreateTeamDialogProps) {
	const [name, setName] = useState("");
	const queryClient = useQueryClient();

	const createTeamMutation = useMutation(orpc.teams.createTeam.mutationOptions({
		onSuccess: () => {
			toast.success("Team created successfully!");
			queryClient.invalidateQueries(orpc.teams.getMyTeams.queryOptions({}));
			onClose();
			setName("");
		},
		onError: (error) => {
			toast.error(`Failed to create team: ${error.message}`);
		}
	}));

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim()) return;
		createTeamMutation.mutate({ name: name.trim() });
	};

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
			<form onSubmit={handleSubmit}>
				<DialogTitle>Create New Team</DialogTitle>
				<DialogContent>
					<TextField
						autoFocus
						margin="dense"
						label="Team Name"
						type="text"
						fullWidth
						variant="outlined"
						value={name}
						onChange={(e) => setName(e.target.value)}
						disabled={createTeamMutation.isPending}
						placeholder="e.g. Engineering Team"
						sx={{ mt: 1 }}
					/>
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2 }}>
					<Button onClick={onClose} color="inherit">Cancel</Button>
					<Button 
						type="submit" 
						variant="contained" 
						disabled={!name.trim() || createTeamMutation.isPending}
					>
						{createTeamMutation.isPending ? "Creating..." : "Create Team"}
					</Button>
				</DialogActions>
			</form>
		</Dialog>
	);
}
