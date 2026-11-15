import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { useTenant } from "@frontend/tenant/TenantContext";
import { Link as RouterLink } from "react-router";

interface BrandMarkProps {
	size?: "small" | "medium";
	/** Where a click goes; defaults to the dashboard. */
	to?: string;
}

/**
 * The app's wordmark. On the shared app it's the template's name
 * (DEFAULT_APP_BRAND); on a team host it's that team's logo + app name, so
 * every navbar, login page and install sheet carries the white-label
 * identity from one place.
 */
export const BrandMark = ({ size = "medium", to = "/dashboard" }: BrandMarkProps) => {
	const { brand, isTenant } = useTenant();
	const markPx = size === "small" ? 24 : 28;

	return (
		<Box
			component={RouterLink}
			to={to}
			sx={{
				display: "inline-flex",
				alignItems: "center",
				gap: 1,
				textDecoration: "none",
				flexShrink: 0,
			}}
		>
			{isTenant && brand.logoUrl && (
				<Avatar
					src={brand.logoUrl}
					alt=""
					variant="rounded"
					sx={{ width: markPx, height: markPx }}
				/>
			)}
			<Box
				component="span"
				sx={{
					fontWeight: 700,
					fontSize: size === "small" ? 18 : 20,
					letterSpacing: -0.5,
					color: "primary.main",
					maxWidth: { xs: 160, sm: 260 },
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				}}
			>
				{brand.appName}
			</Box>
		</Box>
	);
};
