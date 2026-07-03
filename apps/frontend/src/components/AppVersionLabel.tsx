import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { APP_VERSION } from "@frontend/utils/app_version";
import { checkForSwUpdate } from "@frontend/utils/sw_update_check";
import { useState } from "react";
import { toast } from "react-toastify";

interface AppVersionLabelProps {
	/** Prefix text before the version, e.g. "OneQ · ". */
	prefix?: string;
	align?: "left" | "center" | "right";
}

/**
 * Version-number label. Reads as plain caption text; tapping it forces the
 * browser to re-check the service-worker registration against the server
 * and toasts the outcome. If a new SW is found, the global PwaUpdatePrompt
 * takes over (same flow as the automatic periodic check).
 */
export const AppVersionLabel = ({
	prefix,
	align = "center",
}: AppVersionLabelProps) => {
	const [checking, setChecking] = useState(false);

	const handleClick = async () => {
		if (checking) return;
		setChecking(true);
		try {
			const result = await checkForSwUpdate();
			if (result === "already-updating") {
				toast.info("A new version is downloading…");
			} else if (result === "up-to-date") {
				toast.success("You're on the latest version.");
			} else {
				toast.error("Couldn't reach the update server.");
			}
		} finally {
			setChecking(false);
		}
	};

	return (
		<Box sx={{ textAlign: align, pt: 1 }}>
			<Typography
				component="span"
				variant="caption"
				role="button"
				tabIndex={0}
				onClick={handleClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						void handleClick();
					}
				}}
				title="Check for updates"
				sx={{
					color: "text.disabled",
					letterSpacing: "0.03em",
					cursor: checking ? "wait" : "pointer",
					userSelect: "none",
					opacity: checking ? 0.6 : 1,
					transition: "opacity 0.15s ease-in-out",
					"&:hover": { color: "text.secondary" },
					"&:focus-visible": { outline: "none", color: "text.secondary" },
				}}
			>
				{checking ? "Checking…" : `${prefix ?? ""}v${APP_VERSION}`}
			</Typography>
		</Box>
	);
};
