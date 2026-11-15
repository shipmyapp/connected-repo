import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export interface ErrorScreenProps {
	title: string;
	detail?: string;
	actionLabel: string;
	/** A full page load on purpose: after an error the router's state is not trusted. */
	actionHref: string;
}

/** A whole-page error, never a blank screen (route errors and 404s). */
export const ErrorScreen = ({ title, detail, actionLabel, actionHref }: ErrorScreenProps) => (
	<Box
		sx={{
			minHeight: "100vh",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			bgcolor: "background.default",
			px: 2,
		}}
	>
		<Stack spacing={2} alignItems="center" sx={{ textAlign: "center", maxWidth: 420 }}>
			<Typography variant="h4" component="h1" fontWeight={700}>
				{title}
			</Typography>
			{detail && (
				<Typography variant="body1" color="text.secondary">
					{detail}
				</Typography>
			)}
			<Button href={actionHref} variant="contained" sx={{ mt: 1, minHeight: 44 }}>
				{actionLabel}
			</Button>
		</Stack>
	</Box>
);
