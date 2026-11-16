import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { MaterialReactTable } from "@connected-repo/ui-mui/mrt/MaterialReactTable";
import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";
import type { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import { Tooltip } from "@mui/material";
import type { MRT_Cell, MRT_ColumnDef, MRT_Row } from "material-react-table";
import { useMemo } from "react";

interface JournalEntryTableViewProps {
	entries: JournalEntrySelectAll[];
	onEntryClick: (entryId: string) => void;
	attachments?: Record<string, FileSelectAll[]>;
}

function TableThumbnailItem({ attachment }: { attachment: FileSelectAll }) {
	const url = attachment.thumbnailCdnUrl || attachment.cdnUrl;
	if (!url) return null;

	return (
		<Box
			component="img"
			src={url}
			alt={attachment.fileName}
			sx={{
				width: 24,
				height: 24,
				borderRadius: 0.5,
				objectFit: "cover",
				border: "1px solid",
				borderColor: "divider",
			}}
		/>
	);
}

function MultipleTableThumbnails({ attachments }: { attachments: FileSelectAll[] }) {
	const images = attachments.filter(
		(a) => a.mimeType.startsWith("image/") || a.type === "attachment",
	);
	if (images.length === 0) return null;

	return (
		<Stack direction="row" spacing={0.25}>
			{images.slice(0, 3).map((img) => (
				<TableThumbnailItem key={img.id} attachment={img} />
			))}
			{images.length > 3 && (
				<Typography
					variant="caption"
					sx={{ alignSelf: "center", opacity: 0.6, fontSize: "0.65rem" }}
				>
					+{images.length - 3}
				</Typography>
			)}
		</Stack>
	);
}

type JournalEntryRow = JournalEntrySelectAll & { attachments: FileSelectAll[] };

type RowCellProps = { row: MRT_Row<JournalEntryRow> };
type ValueCellProps = { cell: MRT_Cell<JournalEntryRow> };

const truncateContent = (content: string, maxLength = 100) => {
	if (content.length <= maxLength) return content;
	return `${content.substring(0, maxLength)}...`;
};

const formatDate = (date: number | string | Date) =>
	new Date(date).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});

function ThumbnailsCell({ row }: RowCellProps) {
	return <MultipleTableThumbnails attachments={row.original.attachments} />;
}

function PromptCell({ cell }: ValueCellProps) {
	return (
		<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
			{cell.getValue<string>() || "Journal Entry"}
		</Box>
	);
}

function ContentCell({ cell }: ValueCellProps) {
	return (
		<Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
			{truncateContent(cell.getValue<string>())}
		</Box>
	);
}

function DateCell({ row, cell }: RowCellProps & ValueCellProps) {
	const attachmentCount = row.original.attachments.length;
	return (
		<Box
			sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}
		>
			<Box component="span">{formatDate(cell.getValue<number>())}</Box>
			{attachmentCount > 0 && (
				<Tooltip title={`${attachmentCount} attachments`}>
					<Box sx={{ display: "flex", alignItems: "center", color: "text.secondary", ml: 1 }}>
						<AttachFileIcon sx={{ fontSize: 16, transform: "rotate(45deg)" }} />
						<Box component="span" sx={{ fontSize: "0.75rem", fontWeight: 600 }}>
							{attachmentCount}
						</Box>
					</Box>
				</Tooltip>
			)}
		</Box>
	);
}

const columns: MRT_ColumnDef<JournalEntryRow>[] = [
	{
		accessorKey: "id",
		header: "",
		size: 50,
		enableSorting: false,
		enableColumnFilter: false,
		Cell: ThumbnailsCell,
	},
	{ accessorKey: "prompt", header: "Prompt", size: 200, Cell: PromptCell },
	{ accessorKey: "content", header: "Entry Preview", size: 400, Cell: ContentCell },
	{ accessorKey: "createdAt", header: "Date", size: 180, Cell: DateCell },
];

export function JournalEntryTableView({
	entries,
	onEntryClick,
	attachments = {},
}: JournalEntryTableViewProps) {
	const rows = useMemo<JournalEntryRow[]>(
		() => entries.map((entry) => ({ ...entry, attachments: attachments[entry.id] ?? [] })),
		[entries, attachments],
	);

	return (
		<MaterialReactTable
			columns={columns}
			data={rows}
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
