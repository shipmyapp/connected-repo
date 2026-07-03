import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Dialog, DialogActions, DialogContent } from "@connected-repo/ui-mui/feedback/Dialog";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { usePwaInstallCtx } from "@frontend/components/notifications/PwaInstallHost";
import { getDeviceEnv } from "@frontend/utils/device.utils";
import { orpcFetch } from "@frontend/utils/orpc.client";
import { promptAndRegisterPush } from "@frontend/utils/push.utils";
import {
	OfflineWriteError,
	onlineOnlyWrite,
} from "@frontend/worker/db/online-first.adapter";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { toast } from "react-toastify";

interface NotificationPermissionDialogProps {
	open: boolean;
	onClose: (result: "set" | "dismissed") => void;
}

/**
 * Post-first-entry modal. In-app consent gate BEFORE we touch the browser's
 * native Notification.requestPermission() — see push.utils.ts for why the
 * user gesture ordering matters. If the user picks "Set reminder", we save
 * the time and only THEN prompt the browser; if they pick "Not now", we
 * never trigger the native prompt (which would permanently harden a decline).
 */
export const NotificationPermissionDialog = ({
	open,
	onClose,
}: NotificationPermissionDialogProps) => {
	const [time, setTime] = useState<Dayjs>(() => dayjs().hour(21).minute(0));
	const [submitting, setSubmitting] = useState(false);
	const pwa = usePwaInstallCtx();
	const device = getDeviceEnv();

	// iOS Safari cannot receive Web Push until the PWA is installed to the
	// home screen. Route these users through install FIRST — asking for
	// Notification.requestPermission() here is a no-op that just uses up
	// the one permission attempt the browser gives us.
	const needsInstallFirst = device.isIOS && !device.isStandalone;

	const handleSetReminder = async () => {
		setSubmitting(true);
		try {
			const hhmm = time.format("HH:mm");
			// Save the time regardless of push status — the workflow's In-App
			// step lands in the Inbox even without push, so the reminder is
			// still useful. Reminder-time is server-owned config (no local
			// mirror) so we cannot queue it offline; onlineOnlyWrite throws
			// OfflineWriteError if the round-trip can't complete.
			await onlineOnlyWrite({
				entityName: "notifications.setReminderTimes",
				op: () => orpcFetch.notifications.setReminderTimes({ times: [hhmm] }),
			});
			const result = await promptAndRegisterPush();
			if (result === "granted") {
				toast.success(`Daily reminder set for ${hhmm}`);
			} else if (result === "denied") {
				toast.info(
					`Reminder saved for ${hhmm} — enable notifications in your browser to receive push alerts.`,
				);
			}
			onClose("set");
		} catch (error) {
			if (error instanceof OfflineWriteError) {
				toast.error(
					"You're offline — reminders couldn't be saved. Try again when back online.",
				);
			} else {
				console.error("[NotificationPermissionDialog] Set reminder failed", error);
				toast.error("Couldn't save reminder time — please try again from Profile.");
			}
		} finally {
			setSubmitting(false);
		}
	};

	const handleInstall = async () => {
		try {
			await pwa.install();
			// The pwa-install-success-event fires when installation completes;
			// at that point the app relaunches in standalone mode. We close
			// here — after relaunch the banner or profile toggle will
			// prompt for notif.
			onClose("dismissed");
		} catch (error) {
			console.error("[NotificationPermissionDialog] Install failed", error);
			toast.error("Couldn't open install prompt.");
		}
	};

	const handleDismiss = () => {
		onClose("dismissed");
	};

	if (needsInstallFirst) {
		return (
			<Dialog open={open} onClose={handleDismiss} maxWidth="xs" fullWidth>
				<DialogContent>
					<Stack spacing={2} sx={{ pt: 1 }}>
						<Typography variant="h6" fontWeight={600}>
							Add OneQ to your home screen
						</Typography>
						<Typography variant="body2" color="text.secondary">
							Daily journal reminders need iOS to install the app first —
							Safari can't deliver push alerts from a browser tab. Once
							installed, we'll ask for notification permission and set your
							reminder time.
						</Typography>
					</Stack>
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2 }}>
					<Button onClick={handleDismiss} color="inherit">
						Not now
					</Button>
					<Button onClick={handleInstall} variant="contained">
						Show install steps
					</Button>
				</DialogActions>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onClose={handleDismiss} maxWidth="xs" fullWidth>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Typography variant="h6" fontWeight={600}>
						Get daily journal reminders?
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Pick a time and we'll nudge you to log an entry each day.
						You can change or remove reminders anytime from Profile.
					</Typography>
					<TimePicker
						label="Reminder time"
						value={time}
						onChange={(v) => v && setTime(v)}
						ampm={false}
						minutesStep={5}
					/>
				</Stack>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={handleDismiss} color="inherit" disabled={submitting}>
					Not now
				</Button>
				<Button
					onClick={handleSetReminder}
					variant="contained"
					disabled={submitting}
				>
					{submitting ? "Saving…" : "Set reminder"}
				</Button>
			</DialogActions>
		</Dialog>
	);
};
