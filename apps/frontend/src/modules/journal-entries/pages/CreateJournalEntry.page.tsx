import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { CreateJournalEntryForm } from "@frontend/components/CreateJournalEntryForm";

export default function CreateJournalEntryPage() {
	return (
		<Container maxWidth="md" sx={{ px: 0 }}>
			<Box sx={{ mb: 4 }}>
				<Typography 
					variant="h3" 
					component="h1" 
					gutterBottom
					sx={{
						fontSize: { xs: "1.5rem", sm: "2rem" },
						fontWeight: 700,
						mb: 0.5
					}}
				>
					New Journal Entry
				</Typography>
				<Typography variant="body1" color="text.secondary">
					Write your thoughts and reflections
				</Typography>
			</Box>
			<CreateJournalEntryForm />
		</Container>
	);
}