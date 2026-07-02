import { LinearProgress } from "@connected-repo/ui-mui/feedback/LinearProgress";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { useEffect, useState } from "react";
import { useNavigation } from "react-router";

// Small delay so instant navigations don't flash the bar
const SHOW_DELAY_MS = 120;

export const TopProgressBar = () => {
	const navigation = useNavigation();
	const isNavigating = navigation.state !== "idle";
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (!isNavigating) {
			setVisible(false);
			return;
		}
		const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
		return () => clearTimeout(t);
	}, [isNavigating]);

	if (!visible) return null;

	return (
		<Box
			role="progressbar"
			aria-label="Loading page"
			sx={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				// Sit above the app bar but below modals/tooltips so route
				// transitions don't paint over dialogs or select popovers.
				zIndex: (theme) => theme.zIndex.appBar + 2,
			}}
		>
			<LinearProgress sx={{ height: 3 }} />
		</Box>
	);
};
