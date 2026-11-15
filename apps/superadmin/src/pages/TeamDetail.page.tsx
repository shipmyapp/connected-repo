import { When } from "@connected-repo/ui-mui/components/When";
import { Chip } from "@connected-repo/ui-mui/data-display/Chip";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { QueryState } from "@connected-repo/ui-mui/feedback/QueryState";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { PageHeader } from "@connected-repo/ui-mui/layout/PageHeader";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { DataTable } from "@connected-repo/ui-mui/mrt/DataTable";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { SubdomainCard } from "@superadmin/components/SubdomainCard";
import { orpc, type SuperAdminOutputs } from "@superadmin/utils/orpc.client";
import { useQuery } from "@tanstack/react-query";
import type { MRT_ColumnDef } from "material-react-table";
import { Link as RouterLink, useParams } from "react-router";

type Member = SuperAdminOutputs["getTeam"]["members"][number];

const memberColumns: MRT_ColumnDef<Member>[] = [
	{
		id: "name",
		header: "Name",
		accessorFn: (m) => m.userName ?? "",
		Cell: ({ row }) =>
			row.original.userName ?? <Typography color="text.disabled">Invited</Typography>,
	},
	{
		id: "contact",
		header: "Email / phone",
		accessorFn: (m) => m.email ?? m.phoneNumber ?? "—",
	},
	{
		accessorKey: "role",
		header: "Role",
		Cell: ({ row }) => (
			<Chip
				label={row.original.role}
				size="small"
				variant="outlined"
				color={row.original.role === "Owner" ? "primary" : "default"}
			/>
		),
	},
	{
		accessorKey: "addedAt",
		header: "Added",
		Cell: ({ row }) => <When at={row.original.addedAt} />,
	},
	{
		accessorKey: "joinedAt",
		header: "Joined",
		Cell: ({ row }) => <When at={row.original.joinedAt} />,
	},
];

export default function TeamDetailPage() {
	const { teamId = "" } = useParams<{ teamId: string }>();
	const detail = useQuery({
		...orpc.getTeam.queryOptions({ input: { teamId } }),
		enabled: !!teamId,
	});

	return (
		<Stack spacing={3}>
			<Button
				component={RouterLink}
				to="/teams"
				startIcon={<ArrowBackIcon />}
				sx={{ alignSelf: "flex-start", color: "text.secondary" }}
			>
				Teams
			</Button>
			<QueryState query={detail}>
				{({ team, members }) => (
					<>
						<PageHeader
							title={team.name}
							description={`${team.personalTeamForUserId ? "Personal team · " : ""}id ${team.id}`}
							actions={
								<Typography color="text.secondary">
									Created <When at={team.createdAt} />
								</Typography>
							}
						/>
						<SubdomainCard key={team.slug ?? ""} teamId={team.id} slug={team.slug} />
						<Box>
							<Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
								Members ({members.length})
							</Typography>
							<DataTable
								columns={memberColumns}
								data={members}
								initialSort={{ id: "addedAt", desc: false }}
							/>
						</Box>
					</>
				)}
			</QueryState>
		</Stack>
	);
}
