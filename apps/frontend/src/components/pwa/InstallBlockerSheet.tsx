import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { useBackCloses } from "@connected-repo/ui-mui/utils/use_back_closes";
import type { InstallBlocker } from "@connected-repo/zod-schemas/device.zod";
import { useTenant } from "@frontend/tenant/TenantContext";
import { releaseFocus } from "@frontend/utils/install-prompt";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Drawer, IconButton } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useState } from "react";
import { INSTALL_COPY } from "./install.copy";
import { reportInstallBlocker } from "./install-record";

const COPY = INSTALL_COPY.blocker;

/** Answers after which the steps are worth showing again. */
const SHOW_AGAIN: ReadonlySet<InstallBlocker> = new Set([
	"couldnt_find",
	"too_many_steps",
	"later",
]);

/**
 * "What happened?", asked once on an iPhone of
 * someone who opened the Add to Home Screen steps an hour or more ago and has
 * not opened the app from the Home Screen since: whether they could not find
 * the buttons, found it too many steps, would rather stay in Safari, or did
 * add it. The answer goes to this device's record (the install record, `install-record.ts`); closing without one is kept as `skipped`, so it is never
 * asked again.
 */
export function InstallBlockerSheet({
	isOpen,
	onClose,
	onShowSteps,
}: {
	isOpen: boolean;
	onClose: () => void;
	onShowSteps: () => void;
}) {
	const theme = useTheme();
	const { brand } = useTenant();
	const [answer, setAnswer] = useState<InstallBlocker | null>(null);

	const close = () => {
		releaseFocus();
		if (!answer) reportInstallBlocker("skipped");
		onClose();
	};
	// The phone's Back closes the sheet instead of leaving the page under it.
	useBackCloses(isOpen, close);

	const choose = (reason: InstallBlocker) => {
		setAnswer(reason);
		reportInstallBlocker(reason);
	};

	return (
		<Drawer
			anchor="bottom"
			open={isOpen}
			onClose={close}
			PaperProps={{
				sx: {
					borderTopLeftRadius: 24,
					borderTopRightRadius: 24,
					width: { xs: "100%", sm: 420 },
					mx: { xs: 0, sm: "auto" },
					pb: "env(safe-area-inset-bottom)",
					bgcolor: "background.paper",
					backgroundImage: "none",
				},
			}}
		>
			<Box sx={{ position: "relative", pt: 1.5 }} data-testid="install-blocker">
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
					onClick={close}
					aria-label={COPY.close}
					sx={{ position: "absolute", top: 6, right: 6, width: 44, height: 44 }}
				>
					<CloseRoundedIcon fontSize="small" />
				</IconButton>
				<Stack spacing={2} sx={{ px: 3, pt: 1, pb: 3 }}>
					<Stack direction="row" spacing={2} alignItems="center" sx={{ pr: 5 }}>
						<Box
							component="img"
							src={brand.iconUrl}
							alt=""
							sx={{ width: 48, height: 48, borderRadius: 2.5 }}
						/>
						<Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
							{COPY.title}
						</Typography>
					</Stack>
					{answer === null ? (
						<>
							<Typography variant="body2" color="text.secondary">
								{COPY.question}
							</Typography>
							<Stack spacing={1}>
								{COPY.reasons.map((reason) => (
									<Button
										key={reason.value}
										variant="outlined"
										color="inherit"
										onClick={() => choose(reason.value)}
										sx={{ minHeight: 48, justifyContent: "flex-start" }}
									>
										{reason.label}
									</Button>
								))}
							</Stack>
						</>
					) : (
						<>
							<Typography variant="body2">{COPY.thanks}</Typography>
							<Stack direction="row" spacing={1.5}>
								<Button variant="text" color="inherit" onClick={close} sx={{ minHeight: 48 }}>
									{COPY.close}
								</Button>
								{SHOW_AGAIN.has(answer) && (
									<Button
										variant="contained"
										onClick={() => {
											releaseFocus();
											onClose();
											onShowSteps();
										}}
										sx={{ flexGrow: 1, minHeight: 48 }}
									>
										{COPY.show}
									</Button>
								)}
							</Stack>
						</>
					)}
				</Stack>
			</Box>
		</Drawer>
	);
}
