import { GoogleIcon } from "@connected-repo/ui-mui/components/GoogleIcon";
import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Fade } from "@connected-repo/ui-mui/feedback/Fade";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { AppVersionLabel } from "@frontend/components/AppVersionLabel";
import { env, isTest } from "@frontend/configs/env.config";
import {
	authorizeUrl,
	oauthResumeQuery,
	rememberOAuth,
} from "@frontend/modules/auth/lib/pending-oauth";
import { useTenant } from "@frontend/tenant/TenantContext";
import { authBaseUrl, authClient } from "@frontend/utils/auth.client";
import { getLastLogin } from "@frontend/utils/auth.persistence";
import * as Sentry from "@sentry/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

export const LoginPage = () => {
	const [isLoading, setIsLoading] = useState(false);
	// Why the last attempt to start Google sign-in failed, shown under the button.
	const [signInError, setSignInError] = useState<string | null>(null);
	const [showContent] = useState(true);
	const [searchParams] = useSearchParams();
	const error = searchParams.get("error");
	const lastLogin = getLastLogin();

	// An AI app asking to connect sends a signed-out person here with its
	// authorize request in the address (ADR-045): remember it for this tab,
	// and after sign-in go back to authorize, not the dashboard.
	useEffect(() => {
		rememberOAuth(searchParams);
	}, [searchParams]);
	const { brand, isTenant } = useTenant();

	// Track OAuth errors in Sentry when they occur
	useEffect(() => {
		if (error) {
			const errorMessage = decodeURIComponent(error);

			// Capture OAuth error in Sentry for monitoring
			Sentry.captureMessage(`OAuth Error: ${errorMessage}`, {
				level: "warning",
				tags: {
					error_type: "oauth_error_frontend",
					error_code: error,
				},
				contexts: {
					auth: {
						error_message: errorMessage,
						location: "login_page",
					},
				},
			});
		}
	}, [error]);

	const handleGoogleLogin = async () => {
		setSignInError(null);
		setIsLoading(true);
		let data: { url?: string } | undefined;
		// Same-origin deploys leave VITE_USER_APP_URL empty; fall back to the
		// visible origin so OAuth callbacks land on the frontend domain.
		// A team host signs in to ITSELF: the OAuth callback lands on the shared
		// app host (backend VITE_API_URL), and better-auth then redirects here
		// (trustedOrigins admits the host of a live team). The `.<root>` cookie is
		// readable on both.
		const appOrigin = isTenant
			? window.location.origin
			: env.VITE_USER_APP_URL || window.location.origin;
		const oauthResume = oauthResumeQuery(searchParams);
		const callbackURL = oauthResume
			? authorizeUrl(authBaseUrl ?? window.location.origin, oauthResume)
			: `${appOrigin}/dashboard`;

		try {
			if (isTest) {
				// Loaded only in test mode: the fixture pulls in faker, which no
				// real visitor should download with the sign-in page.
				const { userCreateFixture } = await import("@connected-repo/zod-schemas/user.fixture");
				const dummyUser = userCreateFixture();
				const password = env.VITE_TEST_PASSWORD;
				const email = dummyUser.email ?? "test@example.com";
				if (!password) {
					throw new Error("Test password is not set in environment variables");
				}

				await authClient.signUp.email(
					{
						...dummyUser,
						email,
						image: dummyUser.image ?? undefined,
						password,
						callbackURL,
						journalReminderTimes: [],
					},
					{
						throw: true,
					},
				);

				await authClient.signIn.email(
					{
						email,
						password,
						rememberMe: true,
						callbackURL,
					},
					{
						throw: true,
					},
				);
				// Email/password sign-in does NOT return a redirect URL — it
				// just sets the session cookie. Navigate manually so the
				// Playwright e2e globalSetup's `waitForURL('**/dashboard')`
				// resolves instead of timing out on the login page.
				// Replace, not push: Back from the app must not return to sign-in.
				window.location.replace(callbackURL);
				return;
			} else {
				data = await authClient.signIn.social(
					{
						provider: "google",
						callbackURL,
						errorCallbackURL: `${appOrigin}/auth/error`,
						// newUserCallbackURL: "/welcome",
						disableRedirect: true,
					},
					{
						throw: true,
					},
				);
			}
			if (data?.url) {
				window.location.href = data.url;
			}
		} catch (error) {
			// A refusal (PROVIDER_NOT_FOUND when the backend has no Google keys, a
			// wrong origin) used to leave a button that did nothing.
			Sentry.captureException(error, {
				level: "warning",
				tags: { area: "auth", step: "google_sign_in_start" },
			});
			setSignInError("Google sign-in isn't available right now. Try again in a minute.");
			setIsLoading(false);
		}
	};

	return (
		<Box
			sx={{
				minHeight: "100vh",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: isTenant
					? brand.themeColor
					: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
				px: { xs: 2, sm: 3 },
				py: { xs: 3, sm: 4 },
			}}
		>
			<Container maxWidth="sm">
				<Fade in={showContent} timeout={600}>
					<Paper
						elevation={0}
						sx={{
							p: { xs: 4, sm: 5, md: 6 },
							borderRadius: 3,
							border: "1px solid",
							borderColor: "divider",
							boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
							bgcolor: "background.paper",
							transition: "all 0.3s ease-in-out",
							"&:hover": {
								boxShadow: "0 12px 48px rgba(0,0,0,0.15)",
							},
						}}
					>
						<Stack spacing={4} alignItems="center">
							{/* Header Section */}
							<Box sx={{ textAlign: "center" }}>
								{isTenant && (
									<Stack
										direction="row"
										spacing={1.5}
										alignItems="center"
										justifyContent="center"
										sx={{ mb: 2 }}
									>
										{brand.logoUrl && (
											<Avatar
												src={brand.logoUrl}
												alt=""
												variant="rounded"
												sx={{ width: 40, height: 40 }}
											/>
										)}
										<Typography variant="h5" sx={{ fontWeight: 700 }}>
											{brand.appName}
										</Typography>
									</Stack>
								)}
								<Typography
									variant="h6"
									sx={{
										color: "text.secondary",
										lineHeight: 1.7,
										fontWeight: 400,
										mb: 1,
										fontSize: { xs: "1.1rem", sm: "1.25rem" },
									}}
								>
									{isTenant ? brand.tagline : "Scheduled Prompt & Journal"}
								</Typography>
								<Typography
									variant="body1"
									sx={{
										color: "text.secondary",
										lineHeight: 1.8,
										fontSize: { xs: "0.95rem", sm: "1rem" },
										maxWidth: 400,
										mx: "auto",
									}}
								>
									{isTenant
										? "Sign in with the account your team added."
										: "A simple way to journal and reflect on your day with timely, thought-provoking prompts"}
								</Typography>
							</Box>

							{/* Error Alert */}
							{error && (
								<Fade in>
									<Alert
										severity="error"
										sx={{
											width: "100%",
											maxWidth: 400,
											borderRadius: 2,
										}}
									>
										{error === "oauth_failed"
											? "Authentication failed. Please try again."
											: error === "state_mismatch"
												? "Session expired. Please try signing in again."
												: error === "callback_error"
													? "OAuth callback error. Please try again."
													: `An error occurred: ${decodeURIComponent(error)}`}
									</Alert>
								</Fade>
							)}

							{/* Welcome message */}
							<Typography
								variant="h3"
								sx={{
									fontWeight: 600,
									color: "text.primary",
									mb: 2,
									fontSize: { xs: "2rem", sm: "2.5rem", md: "2.75rem" },
									letterSpacing: "-1px",
								}}
							>
								{lastLogin ? "Welcome back" : "Welcome"}
							</Typography>

							{lastLogin && (
								<Stack
									direction="row"
									spacing={2}
									alignItems="center"
									justifyContent="center"
									onClick={handleGoogleLogin}
									sx={{
										mb: 4,
										width: "115%",
										p: 2,
										borderRadius: 2,
										bgcolor: "action.hover",
										border: "1px solid",
										borderColor: "divider",
										cursor: "pointer",
										transition: "all 0.2s ease-in-out",
										"&:hover": {
											bgcolor: "action.selected",
											borderColor: "primary.main",
											transform: "translateY(-2px)",
											boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
										},
										"&:active": {
											transform: "translateY(0)",
										},
									}}
								>
									<Avatar src={lastLogin.image || undefined} alt={lastLogin.name}>
										{lastLogin.name[0]}
									</Avatar>
									<Box sx={{ textAlign: "left" }}>
										<Typography variant="subtitle1" fontWeight={600}>
											{lastLogin.name}
										</Typography>
										<Typography variant="body2" color="text.secondary">
											{lastLogin.email}
										</Typography>
									</Box>
								</Stack>
							)}

							{/* Google Sign In Button */}
							<Box sx={{ width: "115%" }}>
								<Button
									variant="outlined"
									fullWidth
									onClick={handleGoogleLogin}
									disabled={isLoading}
									sx={{
										py: { xs: 1.75, sm: 1.5 },
										px: 3,
										fontSize: { xs: "1rem", sm: "0.95rem" },
										fontWeight: 600,
										textTransform: "none",
										borderRadius: 2,
										borderWidth: 2,
										borderColor: "divider",
										color: "text.primary",
										bgcolor: "background.paper",
										minHeight: { xs: 56, sm: 52 },
										transition: "all 0.25s ease-in-out",
										boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
										"&:hover": {
											borderWidth: 2,
											borderColor: "primary.main",
											bgcolor: "primary.light",
											transform: "translateY(-2px)",
											boxShadow: "0 4px 16px rgba(102, 126, 234, 0.2)",
										},
										"&:active": {
											transform: "translateY(0)",
											boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
										},
										"&.Mui-disabled": {
											borderColor: "action.disabledBackground",
											bgcolor: "action.disabledBackground",
											color: "action.disabled",
										},
									}}
								>
									<Box
										sx={{
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											gap: 1.5,
										}}
									>
										<GoogleIcon width={20} height={20} />
										<span>{isLoading ? "Connecting..." : "Continue with Google"}</span>
									</Box>
								</Button>
								{signInError && (
									<Alert severity="error" sx={{ mt: 2 }} role="alert">
										{signInError}
									</Alert>
								)}
							</Box>

							{/* Feature Highlights */}
							<Box
								sx={{ mt: 4, pt: 4, borderTop: "1px solid", borderColor: "divider", width: "100%" }}
							>
								<Stack spacing={2}>
									<FeatureItem icon="📝" text="Daily thought-provoking prompts" />
									<FeatureItem icon="⏰" text="Scheduled notifications at your chosen time" />
									<FeatureItem icon="🔍" text="Simple search to revisit past reflections" />
								</Stack>
							</Box>

							{/* Footer */}
							<Box sx={{ mt: 2, textAlign: "center" }}>
								<Typography
									variant="caption"
									sx={{
										color: "text.disabled",
										fontSize: { xs: "0.8rem", sm: "0.75rem" },
										display: "block",
									}}
								>
									By continuing, you agree to our Terms of Service and Privacy Policy
								</Typography>
								<AppVersionLabel />
							</Box>
						</Stack>
					</Paper>
				</Fade>
			</Container>
		</Box>
	);
};

// Helper component for feature items
const FeatureItem = ({ icon, text }: { icon: string; text: string }) => (
	<Box
		sx={{
			display: "flex",
			alignItems: "center",
			gap: 2,
			px: 1,
		}}
	>
		<Typography
			sx={{
				fontSize: { xs: "1.5rem", sm: "1.25rem" },
				lineHeight: 1,
			}}
		>
			{icon}
		</Typography>
		<Typography
			variant="body2"
			sx={{
				color: "text.secondary",
				fontSize: { xs: "0.95rem", sm: "0.9rem" },
				lineHeight: 1.6,
			}}
		>
			{text}
		</Typography>
	</Box>
);
