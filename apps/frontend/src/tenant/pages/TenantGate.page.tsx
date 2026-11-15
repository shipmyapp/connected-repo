import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { DEFAULT_APP_BRAND } from "@connected-repo/zod-schemas/tenant.utils";
import { useTenant } from "@frontend/tenant/TenantContext";
import { sharedAppUrl } from "@frontend/tenant/tenant.resolver";
import type { ReactNode } from "react";

const Shell = ({ children }: { children: ReactNode }) => (
	<Box
		sx={{
			minHeight: "100vh",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			bgcolor: "background.default",
			px: 2,
		}}
	>
		<Container maxWidth="sm">
			<Paper
				elevation={0}
				sx={{ p: { xs: 4, sm: 6 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}
			>
				{children}
			</Paper>
		</Container>
	</Box>
);

/**
 * Wraps the whole app on tenant hosts. Until the slug resolves we hold the
 * router back (so the login page never paints unbranded), and an unknown
 * slug gets a clear dead-end instead of a login form for a workspace that
 * doesn't exist.
 */
export const TenantGate = ({ children }: { children: ReactNode }) => {
	const tenant = useTenant();
	if (!tenant.isTenant) return <>{children}</>;

	if (tenant.status === "loading") {
		return (
			<Shell>
				<LoadingSpinner text="Loading workspace…" />
			</Shell>
		);
	}

	if (tenant.status === "not-found" || tenant.status === "error") {
		const shared = sharedAppUrl();
		const notFound = tenant.status === "not-found";
		return (
			<Shell>
				<Stack spacing={2} alignItems="flex-start">
					<Typography variant="h4" sx={{ fontWeight: 800 }}>
						{notFound ? "Workspace not found" : `Couldn't reach ${DEFAULT_APP_BRAND.appName}`}
					</Typography>
					<Typography color="text.secondary">
						{notFound
							? `There is no team at "${tenant.slug}". Check the address, or ask the team's owner for the right link.`
							: "We couldn't load this workspace. Check your connection and try again."}
					</Typography>
					<Stack direction="row" spacing={1}>
						{!notFound && (
							<Button variant="contained" onClick={() => void tenant.refresh()}>
								Retry
							</Button>
						)}
						{shared && (
							<Button variant="outlined" href={shared}>
								Go to {DEFAULT_APP_BRAND.appName}
							</Button>
						)}
					</Stack>
				</Stack>
			</Shell>
		);
	}

	return <>{children}</>;
};
