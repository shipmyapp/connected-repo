import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Switch } from "@connected-repo/ui-mui/form/Switch";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { usePwaInstallCtx } from "@frontend/components/notifications/PwaInstallHost";
import { usePushToggle } from "@frontend/hooks/use-push-toggle";
import { getDeviceEnv } from "@frontend/lib/device/device-env";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import InstallMobileIcon from "@mui/icons-material/InstallMobile";
import { Divider, IconButton } from "@mui/material";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { toast } from "react-toastify";

const permissionLabel = () => {
	if (typeof Notification === "undefined") return "unsupported";
	return Notification.permission;
};

export const NotificationSettings = () => {
	const queryClient = useQueryClient();
	const pwa = usePwaInstallCtx();
	const device = getDeviceEnv();
	const push = usePushToggle();
	const needsInstallFirst = push.needsInstallFirst;
	const pushOn = push.isOn;
	const pushPending = push.pending !== null;

	const { data: serverTimes = [] } = useQuery({
		...orpc.notifications.getReminderTimes.queryOptions({}),
	});

	// Local draft so users can edit multiple rows before we hit the API.
	// Falls back to server state on load or after refetch.
	const [draftTimes, setDraftTimes] = useState<string[] | null>(null);
	const times = draftTimes ?? serverTimes;

	const setTimesMutation = useMutation(
		orpc.notifications.setReminderTimes.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.notifications.getReminderTimes.queryOptions({}).queryKey,
				});
				setDraftTimes(null);
				toast.success("Reminder times saved");
			},
			onError: (err) => {
				toast.error(err.message || "Failed to save reminder times");
			},
		}),
	);

	const commitTimes = (next: string[]) => {
		setDraftTimes(next);
		// Dedupe + sort so the API contract stays clean.
		const unique = Array.from(new Set(next)).sort();
		setTimesMutation.mutate({ times: unique });
	};

	const updateAt = (index: number, next: Dayjs | null) => {
		if (!next) return;
		const nextArray = [...times];
		nextArray[index] = next.format("HH:mm");
		commitTimes(nextArray);
	};

	const removeAt = (index: number) => {
		commitTimes(times.filter((_, i) => i !== index));
	};

	const addTime = () => {
		const suggestion = dayjs().hour(21).minute(0).format("HH:mm");
		// If suggestion collides, offset by 30 mins per collision until unique.
		let candidate = suggestion;
		let cursor = dayjs(candidate, "HH:mm");
		while (times.includes(candidate)) {
			cursor = cursor.add(30, "minute");
			candidate = cursor.format("HH:mm");
		}
		commitTimes([...times, candidate]);
	};

	return (
		<Card
			sx={{
				p: 3,
				borderRadius: 2,
				border: "1px solid",
				borderColor: "divider",
			}}
		>
			<Stack spacing={2}>
				<Box>
					<Typography variant="h6" sx={{ fontWeight: 700 }}>
						Notifications
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Push notifications are per-device. In-app notifications land in the bell regardless.
					</Typography>
				</Box>

				<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1 }}>
					<Box>
						<Typography variant="body1" sx={{ fontWeight: 600 }}>
							Push notifications on this device
						</Typography>
						<Typography variant="caption" color="text.secondary">
							{needsInstallFirst
								? "iOS Safari needs the app installed to home screen to receive push. Install below, then re-open Settings."
								: `Browser permission: ${permissionLabel()}`}
						</Typography>
					</Box>
					{needsInstallFirst ? (
						<Button
							variant="outlined"
							size="small"
							startIcon={<InstallMobileIcon />}
							onClick={() => void pwa.install()}
						>
							Install app
						</Button>
					) : (
						<Switch
							checked={pushOn}
							disabled={pushPending}
							onChange={(e) => void push.toggle(e.target.checked)}
						/>
					)}
				</Stack>

				{!needsInstallFirst && !device.isStandalone && pushOn && (
					<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1 }}>
						<Box>
							<Typography variant="body2" color="text.secondary">
								Add the app to your home screen for a native-app feel with its own window and icon.
							</Typography>
						</Box>
						<Button
							variant="text"
							size="small"
							startIcon={<InstallMobileIcon />}
							onClick={() => void pwa.install()}
						>
							Install
						</Button>
					</Stack>
				)}

				<Divider />

				<Box>
					<Typography variant="body1" sx={{ fontWeight: 600 }}>
						Daily journal reminders
					</Typography>
					<Typography variant="caption" color="text.secondary">
						Times are in your local timezone (
						{Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local"}).
					</Typography>
				</Box>

				<Stack spacing={1.5}>
					{times.map((time, index) => (
						<Stack
							// biome-ignore lint/suspicious/noArrayIndexKey: order-stable list, index is fine here
							key={`${time}-${index}`}
							direction="row"
							spacing={1}
							alignItems="center"
						>
							<TimePicker
								value={dayjs(time, "HH:mm")}
								onChange={(next) => updateAt(index, next)}
								ampm={false}
								minutesStep={5}
								sx={{ flex: 1 }}
							/>
							<IconButton onClick={() => removeAt(index)} aria-label="Remove reminder time">
								<CloseIcon />
							</IconButton>
						</Stack>
					))}
					<Button
						variant="outlined"
						startIcon={<AddIcon />}
						onClick={addTime}
						disabled={setTimesMutation.isPending}
					>
						Add reminder time
					</Button>
				</Stack>
			</Stack>
		</Card>
	);
};
