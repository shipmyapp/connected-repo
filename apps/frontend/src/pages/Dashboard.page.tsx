import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Fade } from "@connected-repo/ui-mui/feedback/Fade";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { useSessionInfo } from "@frontend/contexts/UserContext";
import { useWorkspace, useActiveTeamId } from "@frontend/contexts/WorkspaceContext";
import { useLocalDbValue } from "@frontend/worker/db/hooks/useLocalDbValue";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import BusinessIcon from "@mui/icons-material/Business";
import PersonIcon from "@mui/icons-material/Person";
import { useNavigate } from "react-router";

const DashboardPage = () => {
	const navigate = useNavigate();
	// Get user data from session context (provided by AppLayout)
	const { user } = useSessionInfo();
	const { activeWorkspace } = useWorkspace();
	const teamId = useActiveTeamId();

	// Use local count for the dashboard
	const { data: entryCount = 0 } = useLocalDbValue("journalEntries", () => getDataProxy().journalEntriesDb.count(teamId), 0, [teamId]);

	return (
		<Box
			sx={{
				minHeight: "100vh",
				bgcolor: "background.default",
				py: { xs: 3, md: 4 },
			}}
		>
			<Container maxWidth="lg">
				<Fade in timeout={400}>
					<Stack spacing={4}>
						{/* Welcome Header */}
						<Card
							sx={{
								p: { xs: 3, md: 4 },
								background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
								color: "white",
								borderRadius: 2,
								boxShadow: "0 8px 32px rgba(102, 126, 234, 0.3)",
							}}
						>
							<Stack
								direction={{ xs: "column", sm: "row" }}
								spacing={3}
								alignItems={{ xs: "center", sm: "flex-start" }}
							>
								{user?.image && (
									<Avatar
										src={user.image}
										alt={user.name || undefined}
										sx={{
											width: 80,
											height: 80,
											border: "4px solid rgba(255,255,255,0.3)",
											boxShadow: 3,
										}}
									/>
								)}
								<Box sx={{ textAlign: { xs: "center", sm: "left" } }}>
									<Typography variant="h4" fontWeight={600} gutterBottom>
										Welcome back, {user?.name || "User"}!
									</Typography>
									<Typography variant="body1" sx={{ opacity: 0.9 }}>
										{user?.email}
									</Typography>
								</Box>
							</Stack>
						</Card>

						{/* Workspace Status */}
						<Card sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
							<Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
								<Stack direction="row" spacing={2} alignItems="center">
									<Box 
										sx={{ 
											p: 1.5, 
											borderRadius: 2, 
											bgcolor: activeWorkspace.type === 'team' ? 'primary.main' : 'secondary.main',
											color: 'white',
											display: 'flex'
										}}
									>
										{activeWorkspace.type === 'team' ? <BusinessIcon /> : <PersonIcon />}
									</Box>
									<Box>
										<Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem', fontWeight: 700 }}>
											Active Workspace
										</Typography>
										<Typography variant="h6" fontWeight={600}>
											{activeWorkspace.name}
										</Typography>
									</Box>
								</Stack>
								<Box sx={{ textAlign: 'right' }}>
									<Typography variant="h4" fontWeight={700} color="primary.main">
										{entryCount}
									</Typography>
									<Typography variant="caption" color="text.secondary" fontWeight={600}>
										Total Entries
									</Typography>
								</Box>
							</Stack>
						</Card>

						{/* Success Message */}
						<Fade in timeout={600}>
							<Alert
								severity="success"
								sx={{
									borderRadius: 2,
									boxShadow: 1,
								}}
							>
								<Typography variant="body1" fontWeight={500}>
									Your account is now active!
								</Typography>
								<Typography variant="body2" color="text.secondary">
									You can now access all features of the application.
								</Typography>
							</Alert>
						</Fade>

						{/* Quick Actions */}
						<Stack spacing={2}>
							<Typography variant="h5" fontWeight={600}>
								Quick Actions
							</Typography>
							<Stack
								direction={{ xs: "column", md: "row" }}
								spacing={2}
							>
								<Card
									sx={{
										p: 3,
										flex: 1,
										cursor: "pointer",
										transition: "all 0.2s ease-in-out",
										border: "1px solid",
										borderColor: "divider",
										"&:hover": {
											borderColor: "primary.main",
											transform: "translateY(-4px)",
											boxShadow: 4,
										},
									}}
									onClick={() => navigate(teamId ? `/teams/${teamId}/settings` : "/profile")}
								>
									<Typography variant="h6" gutterBottom fontWeight={600}>
										{teamId ? "Team Settings" : "View Profile"}
									</Typography>
									<Typography variant="body2" color="text.secondary" mb={2}>
										{teamId ? "Manage team members and permissions" : "Manage your account settings and preferences"}
									</Typography>
									<Button variant="outlined" size="small">
										{teamId ? "Manage Team" : "Go to Profile"}
									</Button>
								</Card>

								<Card
									sx={{
										p: 3,
										flex: 1,
										cursor: "pointer",
										transition: "all 0.2s ease-in-out",
										border: "1px solid",
										borderColor: "divider",
										"&:hover": {
											borderColor: "primary.main",
											transform: "translateY(-4px)",
											boxShadow: 4,
										},
									}}
									onClick={() => navigate("/journal-entries")}
								>
									<Typography variant="h6" gutterBottom fontWeight={600}>
										Journal Entries
									</Typography>
									<Typography variant="body2" color="text.secondary" mb={2}>
										View and manage your {teamId ? "team's" : "personal"} entries
									</Typography>
									<Button variant="outlined" size="small">
										Manage Entries
									</Button>
								</Card>
							</Stack>
						</Stack>
					</Stack>
				</Fade>
			</Container>
		</Box>
	);
};

export default DashboardPage;