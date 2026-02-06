import { Chip } from "@connected-repo/ui-mui/data-display/Chip";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card, CardContent } from "@connected-repo/ui-mui/layout/Card";
import type { LeadSelectAll } from "@connected-repo/zod-schemas/leads.zod";
import BusinessIcon from "@mui/icons-material/Business";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";

interface LeadCardViewProps {
	entries: LeadSelectAll[];
	onEntryClick: (leadId: string) => void;
}

export function LeadCardView({ entries, onEntryClick }: LeadCardViewProps) {
	const formatDate = (date: number | string | Date) => {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<Box
			sx={{
				display: "grid",
				gridTemplateColumns: {
					xs: "1fr",
					sm: "repeat(2, 1fr)",
					lg: "repeat(3, 1fr)",
				},
				gap: { xs: 2, sm: 2.5, lg: 3 },
				width: "100%",
			}}
		>
			{entries.map((lead) => (
				<Card
					key={lead.leadId}
					onClick={() => onEntryClick(lead.leadId)}
					sx={{
						height: "100%",
						display: "flex",
						flexDirection: "column",
						cursor: "pointer",
						border: "1px solid",
						borderColor: "divider",
						transition: "all 0.25s ease-in-out",
						position: "relative",
						"&:hover": {
							transform: "translateY(-6px)",
							boxShadow: 6,
							borderColor: "primary.main",
						},
					}}
				>
					<CardContent sx={{ flexGrow: 1, p: { xs: 2, sm: 2.5 } }}>
						<Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
							<Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary" }}>
								{lead.contactName}
							</Typography>
							{lead.teamId && (
								<Chip 
									label="Team" 
									size="small" 
									color="info" 
									variant="outlined" 
									sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} 
								/>
							)}
						</Box>

						{lead.companyName && (
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
								<BusinessIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
								<Typography variant="body2" color="text.secondary">
									{lead.companyName}
								</Typography>
							</Box>
						)}

						{lead.email && (
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
								<EmailIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
								<Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
									{lead.email}
								</Typography>
							</Box>
						)}

						{lead.phone && (
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
								<PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
								<Typography variant="body2" color="text.secondary">
									{lead.phone}
								</Typography>
							</Box>
						)}

						{/* Tags or other info could go here */}

						<Box
							sx={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								pt: 2,
								mt: 'auto',
								borderTop: "1px solid",
								borderColor: "divider",
							}}
						>
							<Typography variant="caption" color="text.secondary" fontWeight={500}>
								{formatDate(lead.createdAt)}
							</Typography>
							{lead._isPending && (
								<Chip 
									label="Syncing..." 
									size="small" 
									color="warning" 
									variant="filled" 
									sx={{ height: 20, fontSize: '0.65rem' }} 
								/>
							)}
						</Box>
					</CardContent>
				</Card>
			))}
		</Box>
	);
}
