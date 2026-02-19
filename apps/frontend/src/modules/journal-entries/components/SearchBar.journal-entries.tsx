import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { InputAdornment, IconButton } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { useState, useEffect, useCallback } from "react";

interface SearchBarProps {
	onSearchChange: (query: string) => void;
	placeholder?: string;
	debounceMs?: number;
}

export function SearchBar({ onSearchChange, placeholder = "Search entries...", debounceMs = 300 }: SearchBarProps) {
	const [localValue, setLocalValue] = useState("");

	const debouncedSearch = useCallback(
		(value: string) => {
			const timer = setTimeout(() => {
				onSearchChange(value);
			}, debounceMs);
			return () => clearTimeout(timer);
		},
		[onSearchChange, debounceMs]
	);

	useEffect(() => {
		const cleanup = debouncedSearch(localValue);
		return cleanup;
	}, [localValue, debouncedSearch]);

	const handleClear = () => {
		setLocalValue("");
		onSearchChange("");
	};

	return (
		<TextField
			value={localValue}
			onChange={(e) => setLocalValue(e.target.value)}
			placeholder={placeholder}
			size="small"
			fullWidth
			InputProps={{
				startAdornment: (
					<InputAdornment position="start">
						<SearchIcon sx={{ fontSize: 20, color: "text.secondary" }} />
					</InputAdornment>
				),
				endAdornment: localValue && (
					<InputAdornment position="end">
						<IconButton
							size="small"
							onClick={handleClear}
							edge="end"
							aria-label="Clear search"
							sx={{ mr: -0.5 }}
						>
							<ClearIcon sx={{ fontSize: 18 }} />
						</IconButton>
					</InputAdornment>
				),
			}}
			sx={{
				maxWidth: { xs: "100%", sm: 400, md: 500 },
				"& .MuiOutlinedInput-root": {
					bgcolor: "background.paper",
					borderRadius: 2,
				},
			}}
			aria-label="Search journal entries"
		/>
	);
}
