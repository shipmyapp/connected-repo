import { Chip } from "@connected-repo/ui-mui/data-display/Chip";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card, CardContent, Tooltip } from "@mui/material";
import type { LeadSelectAll } from "@connected-repo/zod-schemas/leads.zod";
import BusinessIcon from "@mui/icons-material/Business";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import MicIcon from "@mui/icons-material/Mic";
import { Avatar } from "@connected-repo/ui-mui/data-display/Avatar";

interface LeadCardViewProps {
	entries: (LeadSelectAll & { _isPending?: boolean })[];
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
							<Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
								{(lead as any).visitingCardFrontUrl && (
									<Avatar 
										src={(lead as any).visitingCardFrontUrl} 
										variant="rounded"
										sx={{ width: 40, height: 40, border: '1px solid', borderColor: 'divider' }}
									/>
								)}
								<Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary" }}>
									{lead.contactName}
								</Typography>
							</Box>
							{lead.userTeamId && (
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

						{/* Media Indicators */}
						<Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
							{(lead as any).visitingCardFrontUrl && (
								<Tooltip title="Business Card Captured">
									<Chip 
										icon={<PhotoLibraryIcon sx={{ fontSize: '1rem' }} />} 
										label="Card" 
										size="small" 
										variant="outlined" 
										sx={{ height: 20 }} 
									/>
								</Tooltip>
							)}
							{(lead as any).voiceNoteUrl && (
								<Tooltip title="Voice Note Captured">
									<Chip 
										icon={<MicIcon sx={{ fontSize: '1rem' }} />} 
										label="Voice" 
										size="small" 
										variant="outlined" 
										sx={{ height: 20 }} 
									/>
								</Tooltip>
							)}
						</Box>

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
