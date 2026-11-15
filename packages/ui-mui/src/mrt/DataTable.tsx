import type { MRT_ColumnDef, MRT_RowData } from "material-react-table";
import { MaterialReactTable } from "./MaterialReactTable";

type DataTableProps<T extends MRT_RowData> = {
	columns: MRT_ColumnDef<T>[];
	data: T[];
	initialSort?: { id: string; desc: boolean };
};

/** Material React Table with shared defaults: sortable, filterable, compact, 25 rows a page, no density/full-screen/column menus. */
export const DataTable = <T extends MRT_RowData>({
	columns,
	data,
	initialSort,
}: DataTableProps<T>) => (
	<MaterialReactTable
		columns={columns}
		data={data}
		enableDensityToggle={false}
		enableFullScreenToggle={false}
		enableColumnActions={false}
		initialState={{
			density: "compact",
			pagination: { pageIndex: 0, pageSize: 25 },
			sorting: initialSort ? [initialSort] : [],
		}}
		muiTablePaperProps={{ variant: "outlined", elevation: 0 }}
	/>
);
