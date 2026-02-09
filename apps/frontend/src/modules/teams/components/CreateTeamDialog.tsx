import { 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, Button, Box, Typography 
} from "@mui/material";
import { useState } from "react";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

interface CreateTeamDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (teamId: string) => void;
}

export const CreateTeamDialog = ({ open, onClose, onSuccess }: CreateTeamDialogProps) => {
    const [name, setName] = useState("");
    const [logoUrl, setLogoUrl] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const createMutation = useMutation(orpc.teams.createTeam.mutationOptions());

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        try {
            setIsSubmitting(true);
            const team = await createMutation.mutateAsync({ 
                name: name.trim(), 
                logoUrl: logoUrl.trim() || null 
            });
            toast.success("Team created successfully!");
            onSuccess(team.teamId);
            handleClose();
        } catch (err: any) {
            toast.error(err.message || "Failed to create team");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setName("");
        setLogoUrl("");
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle>Create New Team</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Create a shared workspace to collaborate on journal entries with your team.
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
                        <TextField
                            label="Team Name"
                            fullWidth
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                            placeholder="e.g. Design Team, Family Group"
                        />
                        <TextField
                            label="Logo URL (Optional)"
                            fullWidth
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            placeholder="https://example.com/logo.png"
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleClose} color="inherit">
                        Cancel
                    </Button>
                    <Button 
                        type="submit" 
                        variant="contained" 
                        loading={isSubmitting}
                        disabled={!name.trim()}
                    >
                        Create Team
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};
