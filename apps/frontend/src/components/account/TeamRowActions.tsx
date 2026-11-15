import { ConfirmDialog } from "@connected-repo/ui-mui/components/ConfirmDialog";
import { MenuItem } from "@connected-repo/ui-mui/form/MenuItem";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { IconButton } from "@connected-repo/ui-mui/navigation/IconButton";
import { Menu } from "@connected-repo/ui-mui/navigation/Menu";
import { describeError } from "@connected-repo/ui-mui/utils/rpc_errors";
import type { TeamMemberRole } from "@connected-repo/zod-schemas/enums.zod";
import { useWorkspace } from "@frontend/contexts/WorkspaceContext";
import { orpcFetch } from "@frontend/utils/orpc.client";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { requestSyncNow } from "@frontend/utils/sync-triggers";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

type Act = "leave" | "delete";

/**
 * Leave or delete one team from its row in the Teams list. Any team the
 * person is in, active or not; never the personal team. When it is the
 * active team, this device switches to the personal team first; then the
 * next sync cycle drops the team from this device.
 */
export function TeamRowActions({
	team,
	isActive,
	personalTeamId,
}: {
	team: {
		id: string;
		name: string;
		userRole: TeamMemberRole;
		personalTeamForUserId: string | null;
	};
	isActive: boolean;
	personalTeamId: string | null;
}) {
	const queryClient = useQueryClient();
	const { setActiveTeam } = useWorkspace();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const [act, setAct] = useState<Act | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (team.personalTeamForUserId !== null) return null;

	const run = async (which: Act) => {
		setPending(true);
		setError(null);
		try {
			if (isActive && personalTeamId) await setActiveTeam(personalTeamId);
			if (which === "leave") {
				await orpcFetch.teams.leaveTeam({ teamId: team.id }, { context: { noTeam: true } });
			} else {
				await orpcFetch.teams.deleteTeam({ teamId: team.id }, { context: { noTeam: true } });
			}
			setAct(null);
			toast.success(which === "leave" ? `You left ${team.name}.` : `${team.name} was deleted.`);
			await queryClient.invalidateQueries({ queryKey: orpc.teams.getMyTeams.key() });
			void requestSyncNow();
		} catch (err) {
			setError(describeError(err));
		} finally {
			setPending(false);
		}
	};

	// Clicks inside (the menu and the dialog are portals, but React events
	// still bubble through them) must not reach the row's team switch.
	return (
		<Box component="span" onClick={(e) => e.stopPropagation()} sx={{ display: "contents" }}>
			<IconButton
				aria-label="Team actions"
				onClick={(e) => {
					e.stopPropagation();
					setAnchor(e.currentTarget);
				}}
			>
				<MoreVertIcon />
			</IconButton>
			<Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
				<MenuItem
					onClick={() => {
						setAnchor(null);
						setAct("leave");
					}}
				>
					Leave team
				</MenuItem>
				{team.userRole === "Owner" && (
					<MenuItem
						sx={{ color: "error.main" }}
						onClick={() => {
							setAnchor(null);
							setAct("delete");
						}}
					>
						Delete team
					</MenuItem>
				)}
			</Menu>
			<ConfirmDialog
				open={act !== null}
				title={act === "delete" ? `Delete ${team.name}?` : `Leave ${team.name}?`}
				description={
					act === "delete"
						? "Everyone loses access to it and everything in it, on every device. This can't be undone."
						: "You lose access to its entries and files on every device."
				}
				confirmLabel={act === "delete" ? "Delete team" : "Leave"}
				pending={pending}
				error={error}
				onClose={() => {
					setAct(null);
					setError(null);
				}}
				onConfirm={() => {
					if (act) void run(act);
				}}
			/>
		</Box>
	);
}
