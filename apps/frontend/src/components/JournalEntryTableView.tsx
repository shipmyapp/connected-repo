import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { MaterialReactTable } from "@connected-repo/ui-mui/mrt/MaterialReactTable";
import { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { MRT_ColumnDef } from "material-react-table";
import { useCallback, useMemo, useEffect, useState, useRef } from "react";
import { Tooltip, alpha } from "@mui/material";
import ErrorIcon from "@mui/icons-material/Error";
import AttachFileIcon from "@mui/icons-material/AttachFile";

import { StoredFile } from "@frontend/worker/db/schema.db.types";
import { WithSync } from "@frontend/worker/db/db.manager";
import { getOpfsMediaUrl } from "@frontend/utils/file-url.utils";

interface JournalEntryTableViewProps {
	entries: WithSync<JournalEntrySelectAll>[];
	onEntryClick: (entryId: string) => void;
    attachments?: Record<string, StoredFile[]>;
}

function TableThumbnailItem({ attachment }: { attachment: StoredFile }) {
    const [url, setUrl] = useState<string | null>(null);
    const trackedUrl = useRef<string | null>(null);

    useEffect(() => {
        let previewUrl: string | null = null;

        if (attachment.thumbnailCdnUrl) {
            previewUrl = attachment.thumbnailCdnUrl;
        } else if (attachment._thumbnailOpfsPath) {
            previewUrl = getOpfsMediaUrl(attachment._thumbnailOpfsPath) || null;
        } else if (attachment._thumbnailBlob) {
            previewUrl = URL.createObjectURL(attachment._thumbnailBlob);
        } else if (attachment.cdnUrl) {
            previewUrl = attachment.cdnUrl;
        } else if (attachment._opfsPath) {
            previewUrl = getOpfsMediaUrl(attachment._opfsPath) || null;
        } else if (attachment._blob) {
            previewUrl = URL.createObjectURL(attachment._blob);
        }

        const isObjectUrl = (val: string | null) => val?.startsWith('blob:');

        if (previewUrl && isObjectUrl(previewUrl)) {
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

function MultipleTableThumbnails({ attachments }: { attachments: StoredFile[] }) {
    const images = attachments.filter(a => a.mimeType.startsWith('image/') || a.type === 'attachment');
    if (images.length === 0) return null;

    return (
        <Stack direction="row" spacing={0.25}>
            {images.slice(0, 3).map(img => (
                <TableThumbnailItem key={img.id} attachment={img} />
            ))}
            {images.length > 3 && (
                <Typography variant="caption" sx={{ alignSelf: 'center', opacity: 0.6, fontSize: '0.65rem' }}>
                    +{images.length - 3}
                </Typography>
            )}
        </Stack>
    );
}

export function JournalEntryTableView({ entries, onEntryClick, attachments = {} }: JournalEntryTableViewProps) {
	const truncateContent = useCallback(
		(content: string, maxLength = 100) => {
			if (content.length <= maxLength) return content;
			return `${content.substring(0, maxLength)}...`;
		}, []
	);

	const formatDate = useCallback(
		(date: number | string | Date) => {
			return new Date(date).toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
		}, []
	);

	const columns = useMemo<MRT_ColumnDef<WithSync<JournalEntrySelectAll>>[]>(
		() => [
            {
                accessorKey: "id",
                header: "",
                size: 50,
                enableSorting: false,
                enableColumnFilter: false,
                Cell: ({ row }) => <MultipleTableThumbnails attachments={attachments[row.original.id] || []} />,
            },
			{
				accessorKey: "prompt",
				header: "Prompt",
				size: 200,
				Cell: ({ cell }) => (
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						{cell.getValue<string>() || "Journal Entry"}
					</Box>
				),
			},
			{
				accessorKey: "content",
				header: "Entry Preview",
				size: 400,
				Cell: ({ cell }) => (
					<Box
						sx={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{truncateContent(cell.getValue<string>())}
					</Box>
				),
			},
			{
				accessorKey: "createdAt",
				header: "Date",
				size: 180,
				Cell: ({ row, cell }) => {
                    const rowAttachments = attachments[row.original.id] || [];
                    const attachmentCount = rowAttachments.length;
                    
                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <Box component="span">
                                {formatDate(cell.getValue<number>())}
                            </Box>
                            {attachmentCount > 0 && (
                                <Tooltip title={`${attachmentCount} attachments`}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary', ml: 1 }}>
                                        <AttachFileIcon sx={{ fontSize: 16, transform: 'rotate(45deg)' }} />
                                        <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                            {attachmentCount}
                                        </Box>
                                    </Box>
                                </Tooltip>
                            )}
                        </Box>
                    );
                },
			},
		],
		[formatDate],
	);

	return (
		<MaterialReactTable
			columns={columns}
			data={entries}
			enableColumnActions={false}
			enableColumnFilters={false}
			enableSorting={true}
			enableDensityToggle={false}
			enableFullScreenToggle={false}
			enableHiding={false}
			initialState={{
				density: "comfortable",
				sorting: [{ id: "createdAt", desc: true }],
			}}
			muiTableBodyRowProps={({ row }) => ({
				onClick: () => onEntryClick(row.original.id),
				sx: {
					cursor: "pointer",
					transition: "background-color 0.2s ease-in-out",
					"&:hover": {
						backgroundColor: "action.hover",
					},
				},
			})}
			muiTablePaperProps={{
				sx: {
					border: "1px solid",
					borderColor: "divider",
					boxShadow: "none",
				},
			}}
		/>
	);
}
