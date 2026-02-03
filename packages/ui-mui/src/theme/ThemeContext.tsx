import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createAppTheme } from "./theme.config";

type ThemeMode = "light" | "dark" | "system";
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
}

export const ThemeContextProvider = ({ children }: ThemeContextProviderProps) => {
	// Initialize from localStorage or default to light
	const [mode, setMode] = useState<ThemeMode>(() => {
		const savedMode = localStorage.getItem("theme-mode");
		return (savedMode as ThemeMode) || "light";
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

	const setThemeMode = (newMode: ThemeMode) => {
		setMode(newMode);
	};

	const toggleTheme = () => {
		setMode((prevMode) => {
			if (prevMode === "light") return "dark";
			if (prevMode === "dark") return "system";
			return "light";
		});
	};

	// Determine actual theme to use
	const actualMode: ActualThemeMode = mode === "system" ? systemPreference : mode;

	// Create theme based on mode using the centralized createAppTheme function
	// This preserves all component overrides, typography, and other customizations
	const theme = useMemo(() => createAppTheme(actualMode), [actualMode]);

	return (
		<ThemeContext.Provider value={{ actualMode, mode, setThemeMode, toggleTheme }}>
			<MuiThemeProvider theme={theme}>
				<CssBaseline />
				{children}
			</MuiThemeProvider>
		</ThemeContext.Provider>
	);
};
