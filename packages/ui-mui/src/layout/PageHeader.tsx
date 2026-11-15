import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

type PageHeaderProps = { title: string; description?: string; actions?: ReactNode };

export const PageHeader = ({ title, description, actions }: PageHeaderProps) => (
	<Stack
		direction={{ xs: "column", sm: "row" }}
		spacing={2}
		justifyContent="space-between"
		alignItems={{ xs: "flex-start", sm: "center" }}
		sx={{ mb: 3 }}
	>
		<div>
			<Typography variant="h5" component="h1" fontWeight={600}>
				{title}
			</Typography>
			{description && (
				<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>
					{description}
				</Typography>
			)}
		</div>
		{actions}
	</Stack>
);
