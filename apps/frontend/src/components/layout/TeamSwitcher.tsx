import { Avatar, MenuItem, Menu, Divider } from "@mui/material";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { useWorkspace, type Workspace } from "@frontend/contexts/WorkspaceContext";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PersonIcon from "@mui/icons-material/Person";
import WorkIcon from "@mui/icons-material/Work";
import SettingsIcon from "@mui/icons-material/Settings";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { useNavigate } from "react-router";
import { CreateTeamDialog } from "@frontend/modules/teams/components/CreateTeamDialog";
import { toast } from "react-toastify";

/**
 * TeamSwitcher - A component to switch between Personal and Team workspaces
 */
export const TeamSwitcher = () => {
    const { workspaces, activeWorkspace, setActiveWorkspaceId, refreshWorkspaces } = useWorkspace();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const navigate = useNavigate();
    const open = Boolean(anchorEl);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleWorkspaceSelect = (id: string) => {
        setActiveWorkspaceId(id);
        handleClose();
    };

    const handleCreateSuccess = async (teamId: string) => {
        await refreshWorkspaces();
        setActiveWorkspaceId(teamId);
        setIsCreateDialogOpen(false);
    };

    const getWorkspaceIcon = (workspace: Workspace) => {
        if (workspace.type === "personal") {
            return <PersonIcon sx={{ fontSize: 20 }} />;
        }
        return <WorkIcon sx={{ fontSize: 20 }} />;
    };

    return (
        <Box sx={{ display: "flex", alignItems: "center" }}>
            <Box
                onClick={handleClick}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 2,
                    py: 0.75,
                    borderRadius: 2,
                    cursor: "pointer",
                    transition: "all 0.2s ease-in-out",
                    bgcolor: "action.hover",
                    border: "1px solid",
                    borderColor: "divider",
                    "&:hover": {
                        bgcolor: "action.selected",
                        transform: "translateY(-1px)",
                        boxShadow: (theme) => `0 4px 12px ${theme.palette.action.focus}`,
                    },
                    "&:active": {
                        transform: "translateY(0)",
                    },
                }}
            >
                <Avatar
                    sx={{
                        width: 28,
                        height: 28,
                        bgcolor: activeWorkspace.type === "personal" ? "primary.main" : "secondary.main",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                    }}
                >
                    {getWorkspaceIcon(activeWorkspace)}
                </Avatar>
                
                <Box sx={{ display: { xs: "none", sm: "block" } }}>
                    <Typography
                        variant="caption"
                        sx={{
                            display: "block",
                            lineHeight: 1,
                            color: "text.secondary",
                            fontWeight: 500,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            fontSize: "0.65rem",
                            mb: 0.25,
                        }}
                    >
                        Workspace
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            lineHeight: 1,
                            fontWeight: 600,
                            color: "text.primary",
                            maxWidth: 120,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {activeWorkspace.name}
                    </Typography>
                </Box>

                <ExpandMoreIcon
                    sx={{
                        fontSize: 18,
                        color: "text.secondary",
                        transition: "transform 0.2s",
                        transform: open ? "rotate(180deg)" : "rotate(0)",
                    }}
                />
            </Box>

            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                PaperProps={{
                    elevation: 3,
                    sx: {
                        mt: 1,
                        minWidth: 200,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        "& .MuiMenuItem-root": {
                            px: 2,
                            py: 1.25,
                            gap: 1.5,
                            borderRadius: 1,
                            mx: 0.5,
                            my: 0.25,
                            "&:hover": {
                                bgcolor: "action.hover",
                            },
                        },
                    },
                }}
                transformOrigin={{ horizontal: "left", vertical: "top" }}
                anchorOrigin={{ horizontal: "left", vertical: "bottom" }}
            >
                <Typography
                    variant="overline"
                    sx={{ px: 2, py: 1, display: "block", color: "text.secondary", fontWeight: 700 }}
                >
                    Switch Workspace
                </Typography>
                
                {workspaces.map((workspace) => (
                    <MenuItem
                        key={workspace.id}
                        selected={workspace.id === activeWorkspace.id}
                        onClick={() => handleWorkspaceSelect(workspace.id)}
                    >
                        <Avatar
                            sx={{
                                width: 24,
                                height: 24,
                                bgcolor: workspace.type === "personal" ? "primary.lighter" : "secondary.lighter",
                                color: workspace.type === "personal" ? "primary.main" : "secondary.main",
                            }}
                        >
                            {getWorkspaceIcon(workspace)}
                        </Avatar>
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {workspace.name}
                            </Typography>
                            {workspace.role && (
                                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", lineHeight: 1 }}>
                                    {workspace.role.charAt(0).toUpperCase() + workspace.role.slice(1)}
                                </Typography>
                            )}
                        </Box>
                    </MenuItem>
                ))}

                {activeWorkspace.type === 'team' && (activeWorkspace.role === 'owner' || activeWorkspace.role === 'admin') && (
                    <>
                        <Divider sx={{ my: 1 }} />
                        <MenuItem 
                            onClick={() => {
                                navigate(`/teams/${activeWorkspace.id}/settings`);
                                handleClose();
                            }}
                            sx={{ color: 'text.secondary', gap: 1.5 }}
                        >
                            <Avatar sx={{ width: 24, height: 24, bgcolor: 'transparent', color: 'inherit' }}>
                                <SettingsIcon sx={{ fontSize: 18 }} />
                            </Avatar>
                            <Box sx={{ flexGrow: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    Team Settings
                                </Typography>
                            </Box>
                        </MenuItem>
                    </>
                )}

                <Divider sx={{ my: 1 }} />
                
                <MenuItem 
                    onClick={() => {
                        handleClose();
                        setIsCreateDialogOpen(true);
                    }}
                    sx={{ color: "primary.main", gap: 1.5 }}
                >
                    <Avatar sx={{ width: 24, height: 24, bgcolor: "primary.lighter", color: "primary.main" }}>
                        <AddIcon sx={{ fontSize: 18 }} />
                    </Avatar>
                    <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Create Team
                        </Typography>
                    </Box>
                </MenuItem>
            </Menu>

            <CreateTeamDialog 
                open={isCreateDialogOpen} 
                onClose={() => setIsCreateDialogOpen(false)}
                onSuccess={handleCreateSuccess}
            />
        </Box>
    );
};
