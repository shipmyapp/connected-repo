import { Button } from "@connected-repo/ui-mui/form/Button";
import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { Dialog, DialogActions, DialogContent, DialogTitle } from "@connected-repo/ui-mui/overlay/Dialog";
import { useTeam } from "@frontend/contexts/TeamContext";
import { orpc } from "@frontend/utils/orpc.client";
import { MenuItem } from "@mui/material"; // Using MUI core for Select/MenuItem if not in custom UI
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

interface AddMemberDialogProps {
    open: boolean;
    onClose: () => void;
}

export function AddMemberDialog({ open, onClose }: AddMemberDialogProps) {
    const { currentTeam } = useTeam();
    const queryClient = useQueryClient();
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<"admin" | "user">("user");

    const { mutate, isPending } = useMutation(orpc.teamMembers.addMember.mutationOptions({
        onSuccess: () => {
            toast.success("Member added successfully");
            queryClient.invalidateQueries({ queryKey: ['teamMembers'] }); // Invalidate generic
            // Better: invalidate specific query. For now, general invalidation.
            // Specifically: orpc.teamMembers.getMembers.key({ userTeamId: currentTeam!.userTeamId })
            
            setEmail("");
            setRole("user");
            onClose();
        },
        onError: (err) => {
            toast.error(err.message);
        }
    }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentTeam) return;

        mutate({
            userTeamId: currentTeam.userTeamId,
            email,
            role
        });
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <form onSubmit={handleSubmit}>
                <DialogTitle>Add Team Member</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Email Address"
                        type="email"
                        fullWidth
                        variant="outlined"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isPending}
                        sx={{ mb: 2 }}
                    />
                    
                    <TextField
                        select
                        margin="dense"
                        label="Role"
                        fullWidth
                        variant="outlined"
                        value={role}
                        onChange={(e: any) => setRole(e.target.value)}
                        disabled={isPending}
                        SelectProps={{
                            native: false
                        }}
                    >
                        <MenuItem value="user">User</MenuItem>
                        <MenuItem value="admin">Admin</MenuItem>
                    </TextField>

                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} disabled={isPending}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={isPending}>
                        {isPending ? "Adding..." : "Add Member"}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
