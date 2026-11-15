import { When } from "@connected-repo/ui-mui/components/When";
import { QueryState } from "@connected-repo/ui-mui/feedback/QueryState";
import { PageHeader } from "@connected-repo/ui-mui/layout/PageHeader";
import { DataTable } from "@connected-repo/ui-mui/mrt/DataTable";
import { orpc, type SuperAdminOutputs } from "@superadmin/utils/orpc.client";
import { useQuery } from "@tanstack/react-query";
import type { MRT_ColumnDef } from "material-react-table";

type AuditRow = SuperAdminOutputs["auditList"]["rows"][number];

/** A value as one short line: "—" for nothing, compact JSON otherwise. */
const compact = (value: unknown): string => (value == null ? "—" : JSON.stringify(value));

const columns: MRT_ColumnDef<AuditRow>[] = [
	{
		accessorKey: "createdAt",
		header: "When",
		Cell: ({ row }) => <When at={row.original.createdAt} />,
	},
	{ id: "actor", header: "By", accessorFn: (r) => r.actorEmail ?? r.actorUserId },
	{ accessorKey: "action", header: "Action", filterVariant: "select" },
	{
		id: "target",
		header: "Target",
		accessorFn: (r) => `${r.targetKind} ${r.targetId ?? ""}`.trim(),
	},
	{
		id: "change",
		header: "Before → after",
		accessorFn: (r) => `${compact(r.before)} → ${compact(r.after)}`,
	},
	{ id: "reason", header: "Reason", accessorFn: (r) => r.reason ?? "—" },
	{ id: "ip", header: "IP", accessorFn: (r) => r.ipAddress ?? "—" },
];

/** Every console change, newest first: who, what, before and after, why, from where. */
export default function AuditPage() {
	const audit = useQuery(orpc.auditList.queryOptions({ input: { limit: 200, offset: 0 } }));
	return (
		<>
			<PageHeader
				title="Audit"
				description={
					audit.data
						? `${audit.data.total} change${audit.data.total === 1 ? "" : "s"} recorded; the 200 newest are listed.`
						: "Every change made from this console."
				}
			/>
			<QueryState
				query={audit}
				isEmpty={(d) => d.rows.length === 0}
				emptyText="No changes recorded yet."
			>
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
