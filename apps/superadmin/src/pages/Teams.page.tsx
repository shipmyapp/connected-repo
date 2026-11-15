import { When } from "@connected-repo/ui-mui/components/When";
import { Chip } from "@connected-repo/ui-mui/data-display/Chip";
import { QueryState } from "@connected-repo/ui-mui/feedback/QueryState";
import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { PageHeader } from "@connected-repo/ui-mui/layout/PageHeader";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { DataTable } from "@connected-repo/ui-mui/mrt/DataTable";
import Link from "@mui/material/Link";
import { orpc, type SuperAdminOutputs } from "@superadmin/utils/orpc.client";
import { useQuery } from "@tanstack/react-query";
import type { MRT_ColumnDef } from "material-react-table";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router";

type TeamRow = SuperAdminOutputs["listTeams"]["rows"][number];

const numeric = { align: "right" as const, sx: { fontVariantNumeric: "tabular-nums" } };

const columns: MRT_ColumnDef<TeamRow>[] = [
	{
		accessorKey: "name",
		header: "Team",
		Cell: ({ row }) => (
			<Stack direction="row" spacing={1} alignItems="center">
				<Link component={RouterLink} to={`/teams/${row.original.id}`}>
					{row.original.name}
				</Link>
				{row.original.personalTeamForUserId && (
					<Chip label="Personal" size="small" variant="outlined" />
				)}
			</Stack>
		),
	},
	{ id: "owner", header: "Owner", accessorFn: (row) => row.ownerEmail ?? "—" },
	{
		accessorKey: "memberCount",
		header: "Members",
		muiTableBodyCellProps: numeric,
		muiTableHeadCellProps: { align: "right" },
	},
	{
		accessorKey: "createdAt",
		header: "Created",
		Cell: ({ row }) => <When at={row.original.createdAt} />,
	},
];

/** Every team, newest first; the search runs on the server (name). */
export default function TeamsPage() {
	const [search, setSearch] = useState("");
	const [debounced, setDebounced] = useState("");
	useEffect(() => {
		const t = setTimeout(() => setDebounced(search.trim()), 250);
		return () => clearTimeout(t);
	}, [search]);

	const teams = useQuery(
		orpc.listTeams.queryOptions({
			input: { search: debounced || undefined, limit: 200, offset: 0 },
		}),
	);

	return (
		<>
			<PageHeader
				title="Teams"
				description={
					teams.data
						? `${teams.data.total} team${teams.data.total === 1 ? "" : "s"}; the 200 newest are listed.`
						: undefined
				}
				actions={
					<TextField
						placeholder="Search by name"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						sx={{ minWidth: { sm: 320 } }}
					/>
				}
			/>
			<QueryState query={teams} isEmpty={(d) => d.rows.length === 0} emptyText="No teams match.">
				{(d) => (
					<DataTable
						columns={columns}
						data={d.rows}
						initialSort={{ id: "createdAt", desc: true }}
					/>
				)}
			</QueryState>
		</>
	);
}
