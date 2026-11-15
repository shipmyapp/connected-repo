import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { useBackCloses } from "@connected-repo/ui-mui/utils/use_back_closes";
import { usePwaInstallCtx } from "@frontend/components/notifications/PwaInstallHost";
import { isTest } from "@frontend/configs/env.config";
import { useTenant } from "@frontend/tenant/TenantContext";
import { chromeIntentUrl, releaseFocus, usesInstallDialog } from "@frontend/utils/install-prompt";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { Drawer, IconButton } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { InstallBlockerSheet } from "./InstallBlockerSheet";
import { InstallScreens } from "./InstallScreens";
import { INSTALL_COPY } from "./install.copy";
import { onInstallDialog, openInstallDialog, prepareInstallDialog } from "./install-dialog";
import {
	markInstallOfferShown,
	mayAskInstallBlocker,
	mayOfferInstallNow,
	reportInstallTry,
} from "./install-record";

const OFFER_DELAY_MS = 1200;
/** How soon the offer looks again when it was held back. */
const OFFER_RETRY_MS = 3000;
/** Never offered before sign-in. Add a project's own public paths here. */
const QUIET_PATHS = ["/auth"];

const isQuietPath = () => QUIET_PATHS.some((path) => window.location.pathname.startsWith(path));

/** Someone is typing: a sheet now would take the field's focus. */
const isTyping = () => {
	const active = document.activeElement;
	return (
		active instanceof HTMLElement &&
		(active.isContentEditable || active.matches("input, textarea, select"))
	);
};

/** An app installed from another Android browser is asked each time it opens: "Not now" holds for this visit only. */
const MOVE_DISMISS_KEY = "pwa.move-to-chrome-dismissed";
const isMoveDismissed = (): boolean => {
	try {
		return sessionStorage.getItem(MOVE_DISMISS_KEY) === "1";
	} catch {
		return false;
	}
};
const rememberMoveDismissal = () => {
	try {
		sessionStorage.setItem(MOVE_DISMISS_KEY, "1");
	} catch {
		// The question simply comes back on the next screen.
	}
};

/**
 * The install offer. It offers itself once on a phone that can install and
 * opens whenever someone taps Install where the browser has no dialog. Where
 * the install dialog covers the browser (Apple's walk-through, an iPhone's
 * in-app browsers, Chromium's own dialog: `usesInstallDialog`) it opens
 * `<pwa-install>`; elsewhere (Android's move to Chrome, other in-app browsers,
 * the menus) this sheet shows the steps. When it may offer itself is the
 * install record's (`install-record.ts`): never where the app is installed
 * here, otherwise 48 hours after it was last shown or closed; a tap on
 * Install always shows it. On an iPhone where the steps were opened and
 * nothing was installed, the offer asks "what happened?" once instead.
 */
export const PwaInstallSheet = () => {
	const theme = useTheme();
	const pwa = usePwaInstallCtx();
	// The app's name and icon: a team's own on its host, the template's otherwise.
	const { brand } = useTenant();
	const [isOffered, setIsOffered] = useState(false);
	const [isPending, setIsPending] = useState(false);
	const [isBlockerOpen, setIsBlockerOpen] = useState(false);
	/** The install dialog could not load (offline, a blocked script): this sheet stands in. */
	const [isDialogDown, setIsDialogDown] = useState(false);
	const isDialogGuide = usesInstallDialog(pwa.guide) && !isDialogDown;
	/** What the dialog's answers are about, for the install record. */
	const guideRef = useRef(pwa.guide);
	guideRef.current = pwa.guide;

	// Installed from another Android browser: asked to move to Chrome each time it opens.
	const isMove = pwa.guide === "REINSTALL_IN_CHROME";
	const isChromeHandoff = pwa.guide === "USE_CHROME" || isMove;
	const isPhoneOffer =
		pwa.guide === "NATIVE" ||
		pwa.guide === "IOS_SAFARI" ||
		pwa.guide === "IOS_OTHER_BROWSER" ||
		isChromeHandoff;
	const canOffer = !isTest && isPhoneOffer && (!pwa.isStandalone || isMove);

	useEffect(() => {
		if (!canOffer || (isMove && isMoveDismissed())) return;
		let timer = 0;
		let isLive = true;
		// Looked at when the timer fires, not when it starts: a sign-in redirect
		// moves the address after mount, and the sheet must not open over a
		// field there (it would hide #root while the field kept focus).
		const offer = () => {
			if (isQuietPath() || isTyping()) {
				timer = window.setTimeout(offer, OFFER_RETRY_MS);
				return;
			}
			void (async () => {
				// Opened the steps on this iPhone and nothing came of it: ask what happened, once.
				if (!isMove && (await mayAskInstallBlocker())) {
					if (!isLive) return;
					markInstallOfferShown();
					releaseFocus();
					setIsBlockerOpen(true);
					return;
				}
				const isAllowed = isMove || (await mayOfferInstallNow());
				if (!isLive || !isAllowed) return;
				if (!isMove) markInstallOfferShown();
				releaseFocus();
				if (usesInstallDialog(guideRef.current) && (await openInstallDialog())) {
					reportInstallTry("shown", { guide: guideRef.current, via: "offer" });
					return;
				}
				if (!isLive) return;
				if (usesInstallDialog(guideRef.current)) setIsDialogDown(true);
				reportInstallTry("shown", { guide: guideRef.current, via: "offer" });
				setIsOffered(true);
			})();
		};
		timer = window.setTimeout(offer, OFFER_DELAY_MS);
		return () => {
			isLive = false;
			window.clearTimeout(timer);
		};
	}, [canOffer, isMove]);

	// Made ahead, hidden, where it will be offered, so the offer opens at once.
	useEffect(() => {
		if (canOffer && isDialogGuide && navigator.onLine !== false) void prepareInstallDialog();
	}, [canOffer, isDialogGuide]);

	// A tap on Install where the dialog covers this browser: the dialog, on its first screen like the offer.
	useEffect(() => {
		if (!pwa.isGuideOpen || !isDialogGuide) return;
		pwa.closeGuide();
		void openInstallDialog().then((isShown) => {
			if (isShown) {
				reportInstallTry("shown", { guide: guideRef.current, via: "tap" });
				return;
			}
			setIsDialogDown(true);
			void pwa.install();
		});
	}, [pwa, isDialogGuide]);

	// What the person did in the dialog, for the install record; closing it starts the 48 hours.
	useEffect(
		() => onInstallDialog((step) => reportInstallTry(step, { guide: guideRef.current })),
		[],
	);

	const isOpen =
		!isDialogGuide && (pwa.isGuideOpen || (isOffered && canOffer)) && pwa.guide !== "NONE";
	const steps = INSTALL_COPY.steps[pwa.guide];
	const isNative = pwa.guide === "NATIVE";

	const close = () => {
		// Focus left inside a closing sheet is what the browser warns about
		// ("Blocked aria-hidden"): MUI hides the sheet before focus returns.
		releaseFocus();
		reportInstallTry("closed", { guide: pwa.guide });
		if (isMove) rememberMoveDismissal();
		setIsOffered(false);
		pwa.closeGuide();
	};
	// The phone's Back closes the sheet instead of leaving the page under it.
	useBackCloses(isOpen, close);

	const handleInstall = async () => {
		setIsPending(true);
		try {
			await pwa.install();
			releaseFocus();
			setIsOffered(false);
		} catch {
			toast.error(INSTALL_COPY.failed);
		} finally {
			setIsPending(false);
		}
	};

	const handleCopyLink = async () => {
		reportInstallTry("steps", { guide: pwa.guide });
		try {
			await navigator.clipboard.writeText(window.location.href);
			toast.success(INSTALL_COPY.linkCopied);
		} catch {
			toast.error(INSTALL_COPY.failed);
		}
	};

	return (
		<>
			<InstallBlockerSheet
				isOpen={isBlockerOpen}
				onClose={() => setIsBlockerOpen(false)}
				onShowSteps={() => void pwa.install()}
			/>
			<Drawer
				anchor="bottom"
				open={isOpen}
				onClose={close}
				PaperProps={{
					sx: {
						borderTopLeftRadius: 24,
						borderTopRightRadius: 24,
						borderBottomLeftRadius: { xs: 0, sm: 24 },
						borderBottomRightRadius: { xs: 0, sm: 24 },
						width: { xs: "100%", sm: 420 },
						mx: { xs: 0, sm: "auto" },
						mb: { xs: 0, sm: 3 },
						pb: "env(safe-area-inset-bottom)",
						bgcolor: "background.paper",
						backgroundImage: "none",
					},
				}}
			>
				<Box sx={{ position: "relative", pt: 1.5 }} data-testid="install-sheet">
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
					{/* Above the pictures, which are positioned and come later, so would paint over it. */}
					<IconButton
						onClick={close}
						aria-label={INSTALL_COPY.notNow}
						sx={{
							position: "absolute",
							top: 6,
							right: 6,
							zIndex: 1,
							width: 44,
							height: 44,
							bgcolor: alpha(theme.palette.background.paper, 0.85),
							"&:hover": { bgcolor: theme.palette.background.paper },
						}}
					>
						<CloseRoundedIcon fontSize="small" />
					</IconButton>
					<Box sx={{ mx: 3, mt: 1 }}>
						<InstallScreens />
					</Box>
					<Stack spacing={2.5} sx={{ px: 3, pt: 2, pb: 3 }}>
						<Stack direction="row" spacing={2} alignItems="center">
							<Box
								component="img"
								src={brand.iconUrl}
								alt=""
								sx={{ width: 56, height: 56, borderRadius: 3 }}
							/>
							<Box sx={{ minWidth: 0 }}>
								<Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
									{isMove
										? INSTALL_COPY.moveTitle(brand.appName)
										: INSTALL_COPY.title(brand.appName)}
								</Typography>
								<Typography variant="body2" color="text.secondary">
									{INSTALL_COPY.description}
								</Typography>
							</Box>
						</Stack>

						{isNative ? (
							<Stack component="ul" spacing={1} sx={{ m: 0, pl: 2.5 }}>
								{INSTALL_COPY.features.map((feature) => (
									<Typography component="li" variant="body2" key={feature}>
										{feature}
									</Typography>
								))}
							</Stack>
						) : (
							<Stack spacing={1.25}>
								<Typography variant="body2" color="text.secondary">
									{INSTALL_COPY.intro[pwa.guide]}
								</Typography>
								<Stack component="ol" spacing={1} sx={{ m: 0, p: 0, listStyle: "none" }}>
									{steps.map((step, index) => (
										<Stack
											component="li"
											key={step.id}
											direction="row"
											spacing={1.5}
											alignItems="center"
											sx={{
												px: 1.5,
												py: 1.25,
												borderRadius: 2,
												bgcolor: alpha(theme.palette.info.main, 0.08),
											}}
										>
											<Box
												aria-hidden
												sx={{
													width: 28,
													height: 28,
													flexShrink: 0,
													display: "grid",
													placeItems: "center",
													borderRadius: "50%",
													bgcolor: "primary.main",
													color: "primary.contrastText",
													fontWeight: 700,
													fontSize: "0.875rem",
												}}
											>
												{index + 1}
											</Box>
											<Typography variant="body2" sx={{ lineHeight: 1.4 }}>
												{step.text} <strong>{step.strong}</strong> {step.after ?? ""}
											</Typography>
										</Stack>
									))}
								</Stack>
							</Stack>
						)}

						<Stack direction="row" spacing={1.5}>
							<Button
								variant="text"
								color="inherit"
								onClick={close}
								disabled={isPending}
								sx={{ minHeight: 48 }}
							>
								{INSTALL_COPY.notNow}
							</Button>
							{isNative && (
								<Button
									variant="contained"
									onClick={handleInstall}
									disabled={isPending}
									startIcon={<DownloadRoundedIcon />}
									sx={{ flexGrow: 1, minHeight: 48 }}
								>
									{INSTALL_COPY.install}
								</Button>
							)}
							{pwa.guide === "IN_APP_BROWSER" && (
								<Button
									variant="contained"
									onClick={handleCopyLink}
									sx={{ flexGrow: 1, minHeight: 48 }}
								>
									{INSTALL_COPY.copyLink}
								</Button>
							)}
							{isChromeHandoff && (
								// The same page in Chrome, through Android's intent link; Chrome is on almost every Android phone.
								<Button
									variant="contained"
									href={chromeIntentUrl()}
									onClick={() => reportInstallTry("steps", { guide: pwa.guide })}
									sx={{ flexGrow: 1, minHeight: 48 }}
								>
									{INSTALL_COPY.openInChrome}
								</Button>
							)}
							{!isNative && pwa.guide !== "IN_APP_BROWSER" && !isChromeHandoff && (
								<Button variant="contained" onClick={close} sx={{ flexGrow: 1, minHeight: 48 }}>
									{INSTALL_COPY.gotIt}
								</Button>
							)}
						</Stack>
					</Stack>
				</Box>
			</Drawer>
		</>
	);
};
