import type { PaletteMode } from "@mui/material";
import { alpha, createTheme, type ThemeOptions } from "@mui/material/styles";
import { DrawerTransition } from "../feedback/DrawerTransition";
import "./theme.types"; // Import type augmentations

/**
 * Behaviour every app shares, independent of the palette:
 * - iOS zooms the page in on a field whose text is under 16px and stays
 *   zoomed: on touch screens every field types at 16px. Pinch-zoom is left
 *   alone (index.html has no maximum-scale).
 * - The accessibility floor: a visible ring on keyboard focus, no motion
 *   when the OS asks for less, finger-sized (44px) buttons on touch
 *   screens (desktop tables stay dense), no double-tap delay.
 * - Dialogs open as drawers: docked to the bottom of a phone, to the right
 *   edge from `md` up, full height there and as wide as the dialog's own
 *   maxWidth allows (DrawerTransition slides them in). Existing dialogs need
 *   no change.
 */
const sharedComponentOverrides: ThemeOptions["components"] = {
	MuiCssBaseline: {
		// MUI 7 types this as `CSSObject | string | ((theme: Theme) => CSSInterpolation)`.
		styleOverrides: (theme) => ({
			"@media (pointer: coarse)": {
				"input, textarea, select": { fontSize: "16px !important" },
				// Finger-sized targets on touch screens; desktop tables stay dense.
				".MuiButton-root, .MuiIconButton-root, .MuiToggleButton-root": { minHeight: 44 },
				".MuiIconButton-root": { minWidth: 44 },
			},
			// No 300 ms double-tap wait on buttons and links.
			"button, [role='button'], a": { touchAction: "manipulation" },
			// A keyboard user always sees where they are; a mouse click shows nothing.
			":focus-visible": {
				outline: `2px solid ${theme.palette.primary.main}`,
				outlineOffset: 2,
			},
			// The OS asked for less motion: every animation and transition ends at once.
			"@media (prefers-reduced-motion: reduce)": {
				"*, *::before, *::after": {
					animationDuration: "0.01ms !important",
					animationIterationCount: "1 !important",
					transitionDuration: "0.01ms !important",
					scrollBehavior: "auto !important",
				},
			},
		}),
	},
	MuiDialog: {
		defaultProps: { slots: { transition: DrawerTransition } },
		styleOverrides: {
			container: ({ theme }) => ({
				alignItems: "flex-end",
				[theme.breakpoints.up("md")]: { alignItems: "stretch", justifyContent: "flex-end" },
			}),
			paper: ({ theme }) => ({
				margin: 0,
				width: "100%",
				maxWidth: "100%",
				maxHeight: "92dvh",
				borderRadius: "20px 20px 0 0",
				paddingBottom: "env(safe-area-inset-bottom)",
				// A grab handle, so a phone's sheet reads as one.
				"&::before": {
					content: '""',
					flex: "none",
					alignSelf: "center",
					width: 40,
					height: 4,
					marginTop: 8,
					borderRadius: 2,
					backgroundColor: theme.palette.divider,
				},
				[theme.breakpoints.up("md")]: {
					height: "100dvh",
					maxHeight: "100dvh",
					borderRadius: "20px 0 0 20px",
					paddingBottom: 0,
					"&::before": { display: "none" },
				},
			}),
			paperWidthXs: ({ theme }) => ({ [theme.breakpoints.up("md")]: { maxWidth: 480 } }),
			paperWidthSm: ({ theme }) => ({ [theme.breakpoints.up("md")]: { maxWidth: 600 } }),
			paperWidthMd: ({ theme }) => ({ [theme.breakpoints.up("md")]: { maxWidth: 760 } }),
			paperWidthLg: ({ theme }) => ({ [theme.breakpoints.up("md")]: { maxWidth: 960 } }),
		},
	},
};

/**
 * Base theme configuration shared across light and dark modes
 */
const baseThemeConfig = {
	typography: {
		fontFamily: [
			"-apple-system",
			"BlinkMacSystemFont",
			'"Segoe UI"',
			"Roboto",
			'"Helvetica Neue"',
			"Arial",
			"sans-serif",
		].join(","),
		h1: {
			fontSize: "2.5rem",
			fontWeight: 500,
		},
		h2: {
			fontSize: "2rem",
			fontWeight: 500,
		},
		h3: {
			fontSize: "1.75rem",
			fontWeight: 500,
		},
		h4: {
			fontSize: "1.5rem",
			fontWeight: 500,
		},
		h5: {
			fontSize: "1.25rem",
			fontWeight: 500,
		},
		h6: {
			fontSize: "1rem",
			fontWeight: 500,
		},
	},
	shape: {
		borderRadius: 5,
	},
	spacing: 8,
	components: {
		MuiButton: {
			styleOverrides: {
				root: {
					textTransform: "none" as const,
					fontWeight: 500,
				},
			},
			defaultProps: {
				disableElevation: true,
			},
		},
		MuiTextField: {
			defaultProps: {
				variant: "outlined" as const,
				size: "small" as const,
			},
		},
		MuiCard: {
			styleOverrides: {
				root: {
					boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
				},
			},
		},
		MuiAlert: {
			styleOverrides: {
				root: {
					borderRadius: 5,
				},
			},
		},
	},
};

/**
 * Creates a theme with the specified mode (light or dark)
 * Preserves all component overrides and customizations
 */
/**
 * Per-team palette (white-label). Hex colours; MUI derives light/dark/
 * contrastText from `main`. Undefined/null = stock palette. Background
 * applies to light mode only (a team's light background on a dark theme
 * would break contrast).
 */
export interface PaletteOverrides {
	primary?: string | null;
	secondary?: string | null;
	background?: string | null;
}

export const createAppTheme = (mode: PaletteMode = "light", overrides?: PaletteOverrides) => {
	const base = createTheme({
		...baseThemeConfig,
		components: { ...baseThemeConfig.components, ...sharedComponentOverrides },
		palette: {
			mode,
			...(mode === "light"
				? {
						// Light mode colors
						primary: {
							main: "#007bff",
							light: "#4da3ff",
							dark: "#0056b3",
							lighter: "rgba(0, 123, 255, 0.08)", // For hover/selected states
						},
						secondary: {
							main: "#6c757d",
							light: "#868e96",
							dark: "#495057",
							contrastText: "#fff",
						},
						success: {
							main: "#28a745",
							light: "#48b461",
							dark: "#1e7e34",
							lighter: "rgba(40, 167, 69, 0.08)",
							contrastText: "#fff",
						},
						error: {
							main: "#dc3545",
							light: "#e35d6a",
							dark: "#bd2130",
							lighter: "rgba(220, 53, 69, 0.08)",
							contrastText: "#fff",
						},
						warning: {
							main: "#ffc107",
							light: "#ffcd38",
							dark: "#d39e00",
							contrastText: "#000",
						},
						info: {
							main: "#17a2b8",
							light: "#45b5c6",
							dark: "#117a8b",
							contrastText: "#fff",
						},
						background: {
							default: "#f5f5f5",
							paper: "#ffffff",
						},
						text: {
							primary: "#212121",
							secondary: "#666666",
							disabled: "#9e9e9e",
						},
					}
				: {
						// Dark mode colors
						primary: {
							main: "#4da3ff",
							light: "#80bdff",
							dark: "#007bff",
							lighter: "rgba(77, 163, 255, 0.12)",
						},
						secondary: {
							main: "#868e96",
							light: "#adb5bd",
							dark: "#6c757d",
							contrastText: "#fff",
						},
						success: {
							main: "#48b461",
							light: "#6ec283",
							dark: "#28a745",
							lighter: "rgba(72, 180, 97, 0.12)",
							contrastText: "#fff",
						},
						error: {
							main: "#e35d6a",
							light: "#e97c86",
							dark: "#dc3545",
							lighter: "rgba(227, 93, 106, 0.12)",
							contrastText: "#fff",
						},
						warning: {
							main: "#ffcd38",
							light: "#ffd966",
							dark: "#ffc107",
							contrastText: "#000",
						},
						info: {
							main: "#45b5c6",
							light: "#6dc4d2",
							dark: "#17a2b8",
							contrastText: "#fff",
						},
						background: {
							default: "#121212",
							paper: "#1e1e1e",
						},
						text: {
							primary: "#ffffff",
							secondary: "#b0b0b0",
							disabled: "#666666",
						},
					}),
		},
	});
	if (!overrides?.primary && !overrides?.secondary && !overrides?.background) return base;
	const tint = mode === "light" ? 0.08 : 0.12;
	return createTheme(base, {
		palette: {
			...(overrides.primary
				? {
						primary: {
							...base.palette.augmentColor({ color: { main: overrides.primary } }),
							lighter: alpha(overrides.primary, tint),
						},
					}
				: {}),
			...(overrides.secondary
				? { secondary: base.palette.augmentColor({ color: { main: overrides.secondary } }) }
				: {}),
			...(overrides.background && mode === "light"
				? { background: { default: overrides.background, paper: base.palette.background.paper } }
				: {}),
		},
	});
};

/**
 * Default light theme (for backwards compatibility)
 */
export const theme = createAppTheme("light");
