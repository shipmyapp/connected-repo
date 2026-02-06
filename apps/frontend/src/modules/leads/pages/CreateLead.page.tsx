import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { CreateLeadForm } from "@frontend/modules/leads/components/CreateLeadForm";

export default function CreateLeadPage() {
	return (
		<Container maxWidth="md" sx={{ py: 4 }}>
			<Box sx={{ mb: 4 }}>
				<Typography variant="h3" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
					Capture New Lead
				</Typography>
				<Typography variant="body1" color="text.secondary">
					Enter the contact details of the person you met.
				</Typography>
			</Box>
			<CreateLeadForm />
		</Container>
	);
}
