import { Button } from "@connected-repo/ui-mui/form/Button";
import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { 
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions
} from "@connected-repo/ui-mui/feedback/Dialog";
import { useTeam } from "@frontend/contexts/TeamContext";
import { orpc } from "@frontend/utils/orpc.client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";

// Copied from backend schema to avoid import issues for now
const userTeamCreateZod = z.object({
	name: z.string().min(3, "Name must be at least 3 characters").max(50, "Name must be at most 50 characters"),
	logoUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
});

type CreateTeamForm = z.infer<typeof userTeamCreateZod>;

interface CreateTeamModalProps {
	open: boolean;
	onClose: () => void;
}

export function CreateTeamModal({ open, onClose }: CreateTeamModalProps) {
	const { refreshTeams, setCurrentTeam } = useTeam();
	const {
		register,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<CreateTeamForm>({
		resolver: zodResolver(userTeamCreateZod),
        defaultValues: {
            name: "",
            logoUrl: ""
        }
	});

	const createTeamMutation = useMutation(orpc.userTeams.create.mutationOptions({
		onSuccess: async (data: any) => {
			toast.success("Team created successfully!");
			await refreshTeams();
            // Assuming data is the created team object
            if (data) {
                setCurrentTeam(data);
            }
			reset();
			onClose();
		},
		onError: (error: any) => {
			console.error("Failed to create team:", error);
			// Toast handled by global error handler usually, but we can add specific one
            if (!error.message.includes("authentication")) {
                 toast.error(error.message || "Failed to create team");
            }
		},
	}));

	const onSubmit = (data: CreateTeamForm) => {
        // clean up empty logoUrl
        const payload = {
            ...data,
            logoUrl: data.logoUrl || undefined
        };
		createTeamMutation.mutate(payload);
	};

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
			<DialogTitle>Create New Team</DialogTitle>
			<form onSubmit={handleSubmit(onSubmit)}>
				<DialogContent>
					<TextField
						label="Team Name"
						fullWidth
						margin="normal"
						error={!!errors.name}
						helperText={errors.name?.message}
						{...register("name")}
					/>
					<TextField
						label="Logo URL (Optional)"
						fullWidth
						margin="normal"
						error={!!errors.logoUrl}
						helperText={errors.logoUrl?.message}
						{...register("logoUrl")}
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={onClose} color="inherit">
						Cancel
					</Button>
					<Button
						type="submit"
						variant="contained"
						disabled={isSubmitting || createTeamMutation.isPending}
					>
						{isSubmitting || createTeamMutation.isPending ? "Creating..." : "Create Team"}
					</Button>
				</DialogActions>
			</form>
		</Dialog>
	);
}
