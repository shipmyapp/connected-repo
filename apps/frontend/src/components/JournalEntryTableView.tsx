import { Box } from "@connected-repo/ui-mui/layout/Box";
import { MaterialReactTable } from "@connected-repo/ui-mui/mrt/MaterialReactTable";
import { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { MRT_ColumnDef } from "material-react-table";
import { useCallback, useMemo } from "react";
import { Tooltip } from "@mui/material";
import ErrorIcon from "@mui/icons-material/Error";
import AttachFileIcon from "@mui/icons-material/AttachFile";

interface JournalEntryTableViewProps {
	entries: JournalEntrySelectAll[];
	onEntryClick: (entryId: string) => void;
}

export function JournalEntryTableView({ entries, onEntryClick }: JournalEntryTableViewProps) {
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

	const columns = useMemo<MRT_ColumnDef<JournalEntrySelectAll>[]>(
		() => [
			{
				accessorKey: "prompt",
				header: "Prompt",
				size: 200,
				Cell: ({ row, cell }) => (
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						{cell.getValue<string>() || "Journal Entry"}
						{(row.original as any).status && (['file-upload-failed', 'sync-failed'].includes((row.original as any).status)) && (
							<Tooltip title={(row.original as any).error || "Sync failed"}>
								<ErrorIcon color="error" sx={{ fontSize: 18 }} />
							</Tooltip>
						)}
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
				Cell: ({ row, cell }) => (
					<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
						<Box component="span">
							{formatDate(cell.getValue<number>())}
						</Box>
						{((row.original as any).attachmentUrls?.length > 0 || (row.original as any).attachmentFileIds?.length > 0) && (
							<Tooltip title={`${((row.original as any).attachmentUrls?.length || 0) + ((row.original as any).attachmentFileIds?.length || 0)} attachments`}>
								<Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary', ml: 1 }}>
									<AttachFileIcon sx={{ fontSize: 16, transform: 'rotate(45deg)' }} />
									<Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
										{((row.original as any).attachmentUrls?.length || 0) + ((row.original as any).attachmentFileIds?.length || 0)}
									</Box>
								</Box>
							</Tooltip>
						)}
					</Box>
				),
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
				onClick: () => onEntryClick(row.original.journalEntryId),
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
