import { Typography } from "../data-display/Typography";
import { useMemo } from "react";

export interface CharacterCounterProps {
	current: number;
	max: number;
	warningThreshold?: number; // Default: 0.9 (90%)
	errorThreshold?: number; // Default: 1.0 (100%)
}

export function CharacterCounter({
	current,
	max,
	warningThreshold = 0.9,
	errorThreshold = 1.0,
}: CharacterCounterProps) {
	// Calculate color based on usage percentage
	const color = useMemo(() => {
		const percentage = current / max;

		if (percentage >= errorThreshold) {
			return "error.main"; // Red
		}
		if (percentage >= warningThreshold) {
			return "warning.main"; // Orange
		}
		return "text.secondary"; // Gray
	}, [current, max, warningThreshold, errorThreshold]);

	// Format numbers with commas (1,234)
	const formattedCurrent = current.toLocaleString();
	const formattedMax = max.toLocaleString();

	return (
		<Typography
			variant="caption"
			sx={{
				color,
				fontSize: "0.75rem",
				fontWeight: 500,
				transition: "color 0.3s ease",
				userSelect: "none",
			}}
			aria-live="polite"
			aria-atomic="true"
		>
			{formattedCurrent} / {formattedMax} characters
		</Typography>
	);
}
