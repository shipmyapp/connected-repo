import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { usePwaInstallCtx } from "@frontend/components/notifications/PwaInstallHost";
import { isTest } from "@frontend/configs/env.config";
import { getDeviceEnv } from "@frontend/utils/device.utils";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import OfflineBoltRoundedIcon from "@mui/icons-material/OfflineBoltRounded";
import PhoneIphoneRoundedIcon from "@mui/icons-material/PhoneIphoneRounded";
import { Drawer, IconButton, useMediaQuery } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

const DISMISS_KEY = "pwa.installSheetDismissedAt";
const DISMISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const isDismissedRecently = (): boolean => {
	if (typeof localStorage === "undefined") return false;
	const raw = localStorage.getItem(DISMISS_KEY);
	if (!raw) return false;
	const ts = Number.parseInt(raw, 10);
	if (Number.isNaN(ts)) return false;
	return Date.now() - ts < DISMISS_TTL_MS;
};

/**
 * Bottom-sheet install prompt, inspired by the belgrade-plus /
 * magicbell/pwa-inbox aesthetic (rounded top, big icon block, action
 * button spanning the width) but rendered with our own MUI theme so
 * the palette matches the rest of the app.
 *
 * Auto-opens when either:
 *  - Chromium fired `beforeinstallprompt` (state.isInstallAvailable), or
 *  - The user is on iOS Safari (no native prompt exists, so we surface
 *    manual Add-to-Home-Screen steps).
 *
 * Dismissals are sticky for 3 days — the sheet won't nag on every visit.
 * If the app is already running as an installed PWA, this never renders.
 *
 * On desktop the sheet is width-capped and pinned bottom-center so it
 * feels floating rather than edge-to-edge; on mobile it fills the
 * viewport bottom edge with rounded top corners.
 */
export const PwaInstallSheet = () => {
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
	const pwa = usePwaInstallCtx();
	const device = getDeviceEnv();

	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);

	const canOffer = !isTest && !pwa.isStandalone && (pwa.isInstallAvailable || device.isIOS);

	useEffect(() => {
		if (!canOffer) {
			setOpen(false);
			return;
		}
		if (isDismissedRecently()) return;
		const t = window.setTimeout(() => setOpen(true), 1200);
		return () => window.clearTimeout(t);
	}, [canOffer]);

	if (!canOffer) return null;

	const remember = () => {
		try {
			localStorage.setItem(DISMISS_KEY, String(Date.now()));
		} catch {
			// Storage may be blocked (Safari private mode) — user just sees
			// the sheet again next session; not worth surfacing an error.
		}
	};

	const handleInstall = async () => {
		setPending(true);
		try {
			await pwa.install();
			remember();
			setOpen(false);
		} catch (error) {
			console.error("[PwaInstallSheet] install failed", error);
			toast.error("Couldn't open install prompt.");
		} finally {
			setPending(false);
		}
	};

	const handleClose = () => {
		remember();
		setOpen(false);
	};

	const iosSteps: { id: string; icon: ReactNode; text: ReactNode }[] = [
		{
			id: "share",
			icon: <IosShareRoundedIcon fontSize="small" />,
			text: (
				<>
					Tap the <strong>Share</strong> icon in Safari's toolbar.
				</>
			),
		},
		{
			id: "a2hs",
			icon: <PhoneIphoneRoundedIcon fontSize="small" />,
			text: (
				<>
					Scroll down and choose <strong>Add to Home Screen</strong>.
				</>
			),
		},
	];

	const features: { id: string; icon: ReactNode; text: string }[] = [
		{
			id: "offline",
			icon: <OfflineBoltRoundedIcon fontSize="small" color="primary" />,
			text: "Works offline — journal even without a connection.",
		},
		{
			id: "fullscreen",
			icon: <PhoneIphoneRoundedIcon fontSize="small" color="primary" />,
			text: "Fullscreen app with its own icon on your home screen.",
		},
		{
			id: "reminders",
			icon: <DownloadRoundedIcon fontSize="small" color="primary" />,
			text: "Gentle daily reminders via push notifications.",
		},
	];

	const showIosGuide = device.isIOS && !pwa.isInstallAvailable;

	return (
		<Drawer
			anchor="bottom"
			open={open}
			onClose={handleClose}
			hideBackdrop={!isMobile}
			PaperProps={{
				elevation: isMobile ? 8 : 16,
				sx: {
					// Bottom sheet — rounded top corners, centered/capped on desktop.
					borderTopLeftRadius: 24,
					borderTopRightRadius: 24,
					borderBottomLeftRadius: { xs: 0, sm: 24 },
					borderBottomRightRadius: { xs: 0, sm: 24 },
					width: { xs: "100%", sm: 420 },
					mx: { xs: 0, sm: "auto" },
					mb: { xs: 0, sm: 3 },
					left: { sm: 0 },
					right: { sm: 0 },
					overflow: "hidden",
					bgcolor: "background.paper",
					backgroundImage: `linear-gradient(180deg, ${alpha(
						theme.palette.primary.main,
						0.06,
					)} 0%, ${theme.palette.background.paper} 45%)`,
					boxShadow: `0 -12px 40px ${alpha(theme.palette.common.black, 0.18)}`,
				},
			}}
			ModalProps={{
				keepMounted: false,
				sx: {
					// Desktop: keep the sheet floating bottom-center without
					// darkening the full page; mobile keeps the usual scrim.
					"& .MuiBackdrop-root": {
						bgcolor: { xs: alpha(theme.palette.common.black, 0.5), sm: "transparent" },
					},
				},
			}}
		>
			<Box sx={{ position: "relative", pt: 1.5 }}>
				{/* Grabber bar — visual affordance for a bottom sheet. */}
				<Box
					sx={{
						width: 40,
						height: 4,
						bgcolor: alpha(theme.palette.text.primary, 0.18),
						borderRadius: 2,
						mx: "auto",
						mb: 1,
					}}
				/>
				<IconButton
					onClick={handleClose}
					aria-label="Not now"
					size="small"
					sx={{
						position: "absolute",
						top: 8,
						right: 8,
						color: theme.palette.text.secondary,
					}}
				>
					<CloseRoundedIcon fontSize="small" />
				</IconButton>

				<Stack spacing={2.5} sx={{ px: { xs: 3, sm: 3.5 }, pt: 2, pb: 3 }}>
					<Stack direction="row" spacing={2} alignItems="center">
						<Box
							sx={{
								width: 56,
								height: 56,
								borderRadius: 3,
								bgcolor: "background.paper",
								boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.25)}`,
								overflow: "hidden",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<Box
								component="img"
								src="/apple-touch-icon.png"
								alt="OneQ"
								sx={{ width: "100%", height: "100%", objectFit: "cover" }}
							/>
						</Box>
						<Box sx={{ flexGrow: 1, minWidth: 0 }}>
							<Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
								Install OneQ
							</Typography>
							<Typography variant="body2" color="text.secondary">
								Scheduled Prompt & Journal
							</Typography>
						</Box>
					</Stack>

					{showIosGuide ? (
						<Stack spacing={1.25}>
							<Typography variant="body2" color="text.secondary">
								Add OneQ to your home screen for the best experience.
							</Typography>
							{iosSteps.map((step) => (
								<Stack
									key={step.id}
									direction="row"
									spacing={1.5}
									alignItems="center"
									sx={{
										px: 1.5,
										py: 1.25,
										borderRadius: 2,
										bgcolor: alpha(theme.palette.primary.main, 0.06),
									}}
								>
									<Box
										sx={{
											width: 28,
											height: 28,
											borderRadius: "50%",
											bgcolor: "primary.main",
											color: "primary.contrastText",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											flexShrink: 0,
										}}
									>
										{step.icon}
									</Box>
									<Typography variant="body2" sx={{ lineHeight: 1.4 }}>
										{step.text}
									</Typography>
								</Stack>
							))}
						</Stack>
					) : (
						<Stack spacing={1.25}>
							{features.map((f) => (
								<Stack key={f.id} direction="row" spacing={1.5} alignItems="center">
									<Box
										sx={{
											width: 32,
											height: 32,
											borderRadius: 2,
											bgcolor: alpha(theme.palette.primary.main, 0.1),
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											flexShrink: 0,
										}}
									>
										{f.icon}
									</Box>
									<Typography variant="body2" sx={{ lineHeight: 1.4 }}>
										{f.text}
									</Typography>
								</Stack>
							))}
						</Stack>
					)}

					<Stack direction="row" spacing={1.5} sx={{ pt: 0.5 }}>
						<Button
							variant="text"
							onClick={handleClose}
							disabled={pending}
							sx={{
								flexGrow: 0,
								borderRadius: 2,
								textTransform: "none",
								fontWeight: 600,
								color: "text.secondary",
							}}
						>
							Not now
						</Button>
						<Button
							variant="contained"
							onClick={handleInstall}
							disabled={pending}
							startIcon={<DownloadRoundedIcon />}
							sx={{
								flexGrow: 1,
								borderRadius: 2,
								textTransform: "none",
								fontWeight: 700,
								py: 1.25,
								boxShadow: `0 8px 20px ${alpha(theme.palette.primary.main, 0.35)}`,
							}}
						>
							{pending
								? "Opening…"
								: showIosGuide
									? "Show me how"
									: "Install app"}
						</Button>
					</Stack>
				</Stack>
			</Box>
		</Drawer>
	);
};
