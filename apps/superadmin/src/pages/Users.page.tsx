import { When } from "@connected-repo/ui-mui/components/When";
import { QueryState } from "@connected-repo/ui-mui/feedback/QueryState";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { PageHeader } from "@connected-repo/ui-mui/layout/PageHeader";
import { DataTable } from "@connected-repo/ui-mui/mrt/DataTable";
import { SignOutEverywhereDialog } from "@superadmin/components/SignOutEverywhereDialog";
import { orpc, type SuperAdminOutputs } from "@superadmin/utils/orpc.client";
import { useQuery } from "@tanstack/react-query";
import type { MRT_ColumnDef } from "material-react-table";
import { useEffect, useMemo, useState } from "react";

type UserRow = SuperAdminOutputs["listUsers"]["rows"][number];

/** Every account, newest first; the search runs on the server (name or email). */
export default function UsersPage() {
	const [search, setSearch] = useState("");
	const [debounced, setDebounced] = useState("");
	const [signingOut, setSigningOut] = useState<UserRow | null>(null);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(search.trim()), 250);
		return () => clearTimeout(t);
	}, [search]);

	const users = useQuery(
		orpc.listUsers.queryOptions({
			input: { search: debounced || undefined, limit: 200, offset: 0 },
		}),
	);

	// `setSigningOut` is a stable state setter: the columns never change.
	const columns = useMemo<MRT_ColumnDef<UserRow>[]>(
		() => [
			{ accessorKey: "name", header: "Name" },
			{ id: "email", header: "Email", accessorFn: (u) => u.email ?? "—" },
			{ id: "phone", header: "Phone", accessorFn: (u) => u.phoneNumber ?? "—" },
			{
				accessorKey: "createdAt",
				header: "Signed up",
				Cell: ({ row }) => <When at={row.original.createdAt} />,
			},
			{
				accessorKey: "id",
				header: "User id",
				Cell: ({ row }) => <code>{row.original.id}</code>,
			},
			{
				id: "actions",
				header: "",
				enableSorting: false,
				enableColumnFilter: false,
				Cell: ({ row }) => (
					<Button size="small" color="error" onClick={() => setSigningOut(row.original)}>
						Sign out everywhere
					</Button>
				),
			},
		],
		[],
	);

	return (
		<>
			<PageHeader
				title="Users"
				description={
					users.data
						? `${users.data.total} user${users.data.total === 1 ? "" : "s"}; the 200 newest are listed.`
						: undefined
				}
				actions={
					<TextField
						placeholder="Search by name or email"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						sx={{ minWidth: { sm: 320 } }}
					/>
				}
			/>
			<QueryState query={users} isEmpty={(d) => d.rows.length === 0} emptyText="No users match.">
				{(d) => (
					<DataTable
						columns={columns}
						data={d.rows}
						initialSort={{ id: "createdAt", desc: true }}
					/>
				)}
			</QueryState>
			<SignOutEverywhereDialog user={signingOut} onClose={() => setSigningOut(null)} />
		</>
	);
}
