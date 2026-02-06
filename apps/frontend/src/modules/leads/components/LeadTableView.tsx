import { Box } from "@connected-repo/ui-mui/layout/Box";
import { MaterialReactTable } from "@connected-repo/ui-mui/mrt/MaterialReactTable";
import type { LeadSelectAll } from "@connected-repo/zod-schemas/leads.zod";
import type { MRT_ColumnDef } from "material-react-table";
import { useCallback, useMemo } from "react";

interface LeadTableViewProps {
	entries: LeadSelectAll[];
	onEntryClick: (leadId: string) => void;
}

export function LeadTableView({ entries, onEntryClick }: LeadTableViewProps) {
	const formatDate = useCallback(
		(date: number | string | Date) => {
			return new Date(date).toLocaleDateString("en-US", {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
		}, []
	);

	const columns = useMemo<MRT_ColumnDef<LeadSelectAll>[]>(
		() => [
			{
				accessorKey: "contactName",
				header: "Name",
				size: 150,
			},
			{
				accessorKey: "companyName",
				header: "Company",
				size: 150,
				Cell: ({ cell }) => cell.getValue<string>() || "-",
			},
			{
				accessorKey: "email",
				header: "Email",
				size: 200,
				Cell: ({ cell }) => cell.getValue<string>() || "-",
			},
			{
				accessorKey: "phone",
				header: "Phone",
				size: 150,
				Cell: ({ cell }) => cell.getValue<string>() || "-",
			},
			{
				accessorKey: "createdAt",
				header: "Captured At",
				size: 180,
				Cell: ({ cell }) => formatDate(cell.getValue<number>()),
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
				onClick: () => onEntryClick(row.original.leadId),
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
