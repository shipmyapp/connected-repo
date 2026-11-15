import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createAppTheme, type PaletteOverrides } from "./theme.config";

export type ThemeMode = "light" | "dark" | "system";
type ActualThemeMode = "light" | "dark";

interface ThemeContextType {
	mode: ThemeMode;
	setThemeMode: (mode: ThemeMode) => void;
	toggleTheme: () => void;
	actualMode: ActualThemeMode;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useThemeMode = () => {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useThemeMode must be used within ThemeContextProvider");
	}
	return context;
};

interface ThemeContextProviderProps {
	children: React.ReactNode;
	/** A team's colours on its own host (white-label); unset = stock palette. */
	paletteOverrides?: PaletteOverrides;
}

export const ThemeContextProvider = ({ children, paletteOverrides }: ThemeContextProviderProps) => {
	// Initialize from localStorage or follow the system preference. The
	// signed-in user's own setting replaces this once the session loads.
	const [mode, setMode] = useState<ThemeMode>(() => {
		const savedMode = localStorage.getItem("theme-mode");
		return (savedMode as ThemeMode) || "system";
	});

	// Detect system theme preference
	const [systemPreference, setSystemPreference] = useState<ActualThemeMode>(() => {
		if (typeof window !== "undefined" && window.matchMedia) {
			return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
		}
		return "light";
	});

	// Listen for system theme changes
	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = (e: MediaQueryListEvent) => {
			setSystemPreference(e.matches ? "dark" : "light");
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	// Persist to localStorage when mode changes
	useEffect(() => {
		localStorage.setItem("theme-mode", mode);
	}, [mode]);

	// Stable, so a caller's effect that depends on it does not run again after
	// every change of mode and put the old mode back.
	const setThemeMode = useCallback((newMode: ThemeMode) => setMode(newMode), []);

	// Flips what is on screen: from "system" it goes to the opposite of the
	// system's choice, so a tap always changes something.
	const toggleTheme = useCallback(
		() =>
			setMode((prevMode) => {
				const shown = prevMode === "system" ? systemPreference : prevMode;
				return shown === "dark" ? "light" : "dark";
			}),
		[systemPreference],
	);

	// Determine actual theme to use
	const actualMode: ActualThemeMode = mode === "system" ? systemPreference : mode;

	// Create theme based on mode using the centralized createAppTheme function
	// This preserves all component overrides, typography, and other customizations
	const primary = paletteOverrides?.primary ?? null;
	const secondary = paletteOverrides?.secondary ?? null;
	const background = paletteOverrides?.background ?? null;
	const theme = useMemo(
		() => createAppTheme(actualMode, { primary, secondary, background }),
		[actualMode, primary, secondary, background],
	);

	const value = useMemo(
		() => ({ actualMode, mode, setThemeMode, toggleTheme }),
		[actualMode, mode, setThemeMode, toggleTheme],
	);

	return (
		<ThemeContext.Provider value={value}>
			<MuiThemeProvider theme={theme}>
				<CssBaseline />
				{children}
			</MuiThemeProvider>
		</ThemeContext.Provider>
	);
};
