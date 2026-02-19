import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { Button } from "@connected-repo/ui-mui/form/Button";
import SearchOffIcon from "@mui/icons-material/SearchOff";

interface SearchEmptyStateProps {
	searchQuery: string;
	onClearSearch: () => void;
}

export function SearchEmptyState({ searchQuery, onClearSearch }: SearchEmptyStateProps) {
	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				py: 8,
				px: 3,
			}}
		>
			<SearchOffIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
			<Stack spacing={1.5} alignItems="center">
				<Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary" }}>
					No results found
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", maxWidth: 400 }}>
					No entries match "{searchQuery}". Try different keywords or clear your search.
				</Typography>
				<Button
					variant="outlined"
					size="small"
					onClick={onClearSearch}
					sx={{ mt: 2 }}
				>
					Clear Search
				</Button>
			</Stack>
		</Box>
	);
}
