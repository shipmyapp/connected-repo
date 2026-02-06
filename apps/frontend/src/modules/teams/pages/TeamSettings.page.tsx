import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Chip } from "@connected-repo/ui-mui/data-display/Chip";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { useTeam } from "@frontend/contexts/TeamContext";
import { orpc } from "@frontend/utils/orpc.client";
import { Add as AddIcon, PersonRemove as RemoveIcon } from "@mui/icons-material";
import { IconButton, List, ListItem, ListItemAvatar, ListItemText } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";
import { AddMemberDialog } from "../components/AddMemberDialog";

export const TeamSettingsPage = () => {
    const { currentTeam } = useTeam();
    const queryClient = useQueryClient();
    const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);

    const { data: members, isLoading } = useQuery(
        orpc.teamMembers.getMembers.queryOptions({
            input: { userTeamId: currentTeam?.userTeamId! },
            enabled: !!currentTeam,
        })
    );

    const removeMutation = useMutation(orpc.teamMembers.removeMember.mutationOptions({
        onSuccess: () => {
            toast.success("Member removed");
            queryClient.invalidateQueries({ queryKey: ['teamMembers'] }); 
        },
        onError: (err) => {
            toast.error(err.message);
        }
    }));

    if (!currentTeam) {
        return <Typography>Please select a team to view settings.</Typography>;
    }

    const handleRemove = (memberId: string) => {
        if (confirm("Are you sure you want to remove this member?")) {
            removeMutation.mutate({
                userTeamId: currentTeam.userTeamId,
                teamMemberId: memberId
            });
        }
    };

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" fontWeight="bold">
                    Team Settings: {currentTeam.name}
                </Typography>
            </Box>

            <Paper sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">Members</Typography>
                    <Button 
                        startIcon={<AddIcon />} 
                        variant="contained" 
                        size="small"
                        onClick={() => setIsAddMemberOpen(true)}
                    >
                        Add Member
                    </Button>
                </Box>

                {isLoading ? (
                    <Typography>Loading members...</Typography>
                ) : (
                    <List>
                        {members?.map((member) => (
                            <ListItem
                                key={member.teamMemberId}
                                secondaryAction={
                                    member.role !== 'owner' && (
                                        <IconButton edge="end" aria-label="delete" onClick={() => handleRemove(member.teamMemberId)}>
                                            <RemoveIcon color="error" />
                                        </IconButton>
                                    )
                                }
                            >
                                <ListItemAvatar>
                                    <Avatar src={member.userAvatar ?? undefined} alt={member.userName ?? member.email}>
                                        {member.userName?.[0] ?? member.email[0].toUpperCase()}
                                    </Avatar>
                                </ListItemAvatar>
                                <ListItemText
                                    primary={
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography variant="subtitle1">{member.userName || "Pending User"}</Typography>
                                            <Chip label={member.role} size="small" color={member.role === 'owner' ? 'primary' : 'default'} />
                                        </Stack>
                                    }
                                    secondary={member.email}
                                />
                            </ListItem>
                        ))}
                    </List>
                )}
            </Paper>

            <AddMemberDialog open={isAddMemberOpen} onClose={() => setIsAddMemberOpen(false)} />
        </Container>
    );
};
