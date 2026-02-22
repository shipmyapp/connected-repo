import { Chip } from "@connected-repo/ui-mui/data-display/Chip";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card, CardContent } from "@connected-repo/ui-mui/layout/Card";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import React, { useEffect, useState, useRef } from "react";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import { alpha } from "@mui/material";

interface JournalEntryCardViewProps {
	entries: (JournalEntrySelectAll | any)[];
	onEntryClick: (entryId: string) => void;
	renderExtra?: (entry: any) => React.ReactNode;
    attachments?: Record<string, any[]>;
}

function ThumbnailItem({ attachment }: { attachment: any }) {
    const [url, setUrl] = useState<string | null>(null);
    const trackedUrl = useRef<string | null>(null);

    useEffect(() => {
        let previewUrl: string | null = null;
        if (attachment.thumbnailCdnUrl) {
            previewUrl = attachment.thumbnailCdnUrl;
        } else if (attachment._thumbnailBlob) {
            previewUrl = URL.createObjectURL(attachment._thumbnailBlob);
        } else if (attachment.cdnUrl) {
            previewUrl = attachment.cdnUrl;
        } else if (attachment._blob) {
            previewUrl = URL.createObjectURL(attachment._blob);
        }

        if (previewUrl && previewUrl !== attachment.thumbnailCdnUrl && previewUrl !== attachment.cdnUrl) {
            trackedUrl.current = previewUrl;
        }
        setUrl(previewUrl);

        return () => {
            if (trackedUrl.current) {
                URL.revokeObjectURL(trackedUrl.current);
                trackedUrl.current = null;
            }
        };
    }, [attachment]);

    if (!url) return null;

    return (
        <Box 
            component="img"
            src={url}
            sx={{ 
                width: 24, 
                height: 24, 
                borderRadius: 0.5, 
                objectFit: 'cover',
                border: '1px solid',
                borderColor: 'divider'
            }}
        />
    );
}

function MultipleThumbnailPreview({ attachments }: { attachments: any[] }) {
    const images = attachments.filter(a => a.mimeType.startsWith('image/') || a.type === 'attachment');
    if (images.length === 0) return null;

    return (
        <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}>
            {images.slice(0, 4).map(img => (
                <ThumbnailItem key={img.id} attachment={img} />
            ))}
            {images.length > 4 && (
                <Typography variant="caption" sx={{ alignSelf: 'center', opacity: 0.7 }}>
                    +{images.length - 4}
                </Typography>
            )}
        </Stack>
    );
}

export function JournalEntryCardView({ entries, onEntryClick, renderExtra, attachments = {} }: JournalEntryCardViewProps) {
	const truncateContent = (content: string, maxLength = 100) => {
		if (content.length <= maxLength) return content;
		return `${content.substring(0, maxLength)}...`;
	};

	const formatDate = (date: number | string | Date) => {
		return new Date(date).toLocaleDateString(undefined, {
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
				maxWidth: "100%",
				overflow: "hidden",
			}}
		>
			{entries.map((entry) => (
				<Box
					key={entry.id}
					sx={{
						display: "flex",
						minHeight: 0,
						minWidth: 0,
					}}
				>
					<Card
						onClick={() => onEntryClick(entry.id)}
						sx={{
							height: "100%",
							width: "100%",
							display: "flex",
							flexDirection: "column",
							cursor: "pointer",
							border: "1px solid",
							borderColor: "divider",
							transition: "all 0.25s ease-in-out",
							"&:hover": {
								transform: "translateY(-6px)",
								boxShadow: 6,
								borderColor: "primary.main",
							},
						}}
					>
						<CardContent sx={{ flexGrow: 1, display: "flex", flexDirection: "column", p: { xs: 2, sm: 2.5, lg: 3 } }}>
							<Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, width: '100%' }}>
								<Chip
									label={entry.prompt || "Journal Entry"}
									color="primary"
									size="small"
									sx={{
										fontWeight: 600,
										fontSize: "0.75rem",
										flexShrink: 1,
										overflow: 'hidden',
										'& .MuiChip-label': {
											textOverflow: 'ellipsis',
											overflow: 'hidden',
											whiteSpace: 'nowrap',
										}
									}}
								/>
								{renderExtra && (
									<Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
										{renderExtra(entry)}
									</Box>
								)}
							</Box>

							{/* Content Preview */}
							<Typography
								variant="body1"
								color="text.primary"
								sx={{
									flexGrow: 1,
									mb: 2,
									lineHeight: 1.7,
									overflow: "hidden",
									display: "-webkit-box",
									WebkitLineClamp: 4,
									WebkitBoxOrient: "vertical",
								}}
							>
								{truncateContent(entry.content)}
							</Typography>

							{/* Date Footer */}
							<Box
								sx={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									pt: 2,
									borderTop: "1px solid",
									borderColor: "divider",
								}}
							>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
									<Typography variant="caption" color="text.secondary" fontWeight={500}>
										{formatDate(entry.createdAt)}
									</Typography>
                                    <MultipleThumbnailPreview attachments={attachments[entry.id] || []} />
									{(entry.attachmentUrls?.length > 0 || entry.attachmentFileIds?.length > 0) && (
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, color: 'text.secondary' }}>
											<AttachFileIcon sx={{ fontSize: 14, transform: 'rotate(45deg)' }} />
											<Typography variant="caption" fontWeight={600}>
												{ (entry.attachmentUrls?.length || 0) + (entry.attachmentFileIds?.length || 0) }
											</Typography>
										</Box>
									)}
								</Box>
								<Typography
									variant="caption"
									color="primary.main"
									fontWeight={600}
									sx={{
										textTransform: "uppercase",
										letterSpacing: "0.5px",
									}}
								>
									Read More →
								</Typography>
							</Box>
						</CardContent>
					</Card>
				</Box>
			))}
		</Box>
	);
}
