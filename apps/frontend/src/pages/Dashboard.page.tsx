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
import { DashboardLeadCapture } from "@frontend/components/DashboardLeadCapture";

const DashboardPage = () => {
	// Get user data from session context (provided by AppLayout)
	const { user, isRegistered } = useSessionInfo();

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
								borderRadius: 4,
								boxShadow: "0 8px 32px rgba(102, 126, 234, 0.3)",
							}}
						>
							<Stack
								direction={{ xs: "row" }}
								spacing={2}
								alignItems="center"
							>
								{user?.image && (
									<Avatar
										src={user.image}
										alt={user.name || undefined}
										sx={{
											width: 48,
											height: 48,
											border: "2px solid rgba(255,255,255,0.3)",
										}}
									/>
								)}
								<Box>
									<Typography variant="h6" fontWeight={600}>
										Hi, {user?.name?.split(' ')[0] || "User"}!
									</Typography>
									<Typography variant="caption" sx={{ opacity: 0.8 }}>
										Ready to capture leads?
									</Typography>
								</Box>
							</Stack>
						</Card>

						{/* Instant Capture Section - Mobile First */}
						<DashboardLeadCapture />

						{/* Success Message */}
						<Fade in timeout={600}>
							<Alert 
								severity="info" 
								sx={{ borderRadius: 3, bgcolor: 'primary.lighter', border: 'none' }}
							>
								<Typography variant="body2" fontWeight={500}>
									Pro Tip: Double tap to scan both sides of a card!
								</Typography>
							</Alert>
						</Fade>
					</Stack>
				</Fade>
			</Container>
		</Box>
	);
};

export default DashboardPage;