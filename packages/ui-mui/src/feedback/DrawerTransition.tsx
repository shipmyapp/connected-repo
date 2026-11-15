import Slide from "@mui/material/Slide";
import { useTheme } from "@mui/material/styles";
import type { TransitionProps } from "@mui/material/transitions";
import useMediaQuery from "@mui/material/useMediaQuery";
import { forwardRef, type ReactElement, type Ref } from "react";

/**
 * Every dialog's entrance (theme `MuiDialog`): it slides up from the bottom
 * on a phone and in from the right from the `md` breakpoint, matching where
 * the theme docks the paper. Instant under reduced motion.
 */
export const DrawerTransition = forwardRef(function DrawerTransition(
	props: TransitionProps & { children: ReactElement },
	ref: Ref<unknown>,
) {
	const theme = useTheme();
	const side = useMediaQuery(theme.breakpoints.up("md"));
	const still = useMediaQuery("(prefers-reduced-motion: reduce)");
	return (
		<Slide
			ref={ref}
			direction={side ? "left" : "up"}
			{...props}
			{...(still ? { timeout: 0 } : {})}
		/>
	);
});
