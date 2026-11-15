import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { usePwaInstallCtx } from "@frontend/components/notifications/PwaInstallHost";
import { useTenant } from "@frontend/tenant/TenantContext";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { INSTALL_COPY } from "./install.copy";
import { useInstalledHere } from "./install-record";

/**
 * Install, one tap away on the profile until it is installed on THIS device:
 * the browser's dialog, or the steps for this browser. Hidden once the browser
 * knows (standalone, `appinstalled`, `getInstalledRelatedApps`) or the install
 * record knows (an iPhone's Safari paired with its own Home Screen
 * app). A second phone, or an app probably uninstalled, keeps the card.
 */
export function InstallCard() {
	const pwa = usePwaInstallCtx();
	const installedHere = useInstalledHere();
	const { brand } = useTenant();
	if (pwa.isInstalled || installedHere === true) return null;
	if (!pwa.canInstall) return null;
	return (
		<Card sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
			<Stack
				direction={{ xs: "column", sm: "row" }}
				spacing={2}
				alignItems={{ sm: "center" }}
				justifyContent="space-between"
			>
				<Box>
					<Typography variant="h6" sx={{ fontWeight: 700 }}>
						{INSTALL_COPY.title(brand.appName)}
					</Typography>
					<Typography variant="body2" color="text.secondary">
						{INSTALL_COPY.cardLine}
					</Typography>
				</Box>
				<Button
					variant="outlined"
					startIcon={<DownloadRoundedIcon />}
					onClick={() => void pwa.install()}
					sx={{ alignSelf: { xs: "flex-start", sm: "center" }, minHeight: 48, flexShrink: 0 }}
					data-testid="install-app"
				>
					{INSTALL_COPY.install}
				</Button>
			</Stack>
		</Card>
	);
}
