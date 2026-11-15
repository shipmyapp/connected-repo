import { ConfirmDialog } from "@connected-repo/ui-mui/components/ConfirmDialog";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { describeError } from "@connected-repo/ui-mui/utils/rpc_errors";
import { orpc } from "@superadmin/utils/orpc.client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

/**
 * The team's private-app subdomain, assigned here and only here. The team
 * sees it read-only on its branding page: a subdomain needs the wildcard
 * DNS record and certificate on the operator's side, so handing it out is an
 * operator's act, not a self-service field.
 */
export function SubdomainCard({ teamId, slug }: { teamId: string; slug: string | null }) {
	const queryClient = useQueryClient();
	const [value, setValue] = useState(slug ?? "");
	const [asking, setAsking] = useState(false);
	const mutation = useMutation(
		orpc.assignTeamSlug.mutationOptions({
			onSuccess: async (team) => {
				toast.success(team.slug ? `Subdomain set to ${team.slug}` : "Subdomain cleared");
				setValue(team.slug ?? "");
				await queryClient.invalidateQueries({ queryKey: orpc.getTeam.key() });
				await queryClient.invalidateQueries({ queryKey: orpc.listTeams.key() });
			},
			onError: (err) => toast.error(describeError(err)),
		}),
	);
	const trimmed = value.trim().toLowerCase();
	const unchanged = trimmed === (slug ?? "");

	return (
		<Card sx={{ p: 2.5, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
			<Stack spacing={1.5}>
				<Box>
					<Typography variant="h6" sx={{ fontWeight: 700 }}>
						Private app subdomain
					</Typography>
					<Typography variant="body2" color="text.secondary">
						The team's white-labelled app lives at this label under the root domain. Point the
						wildcard DNS record there before handing it out; the team sees it but cannot change it.
					</Typography>
				</Box>
				<Stack
					direction={{ xs: "column", sm: "row" }}
					spacing={1.5}
					alignItems={{ sm: "flex-start" }}
				>
					<TextField
						label="Subdomain"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="acme-events"
						helperText="3–63 lowercase letters, digits or hyphens. Leave empty to withdraw it."
						fullWidth
						disabled={mutation.isPending}
						slotProps={{ htmlInput: { autoCapitalize: "none", spellCheck: false } }}
					/>
					<Button
						variant="contained"
						disabled={unchanged || mutation.isPending}
						// A first assignment breaks nothing; moving or withdrawing one does.
						onClick={() =>
							slug ? setAsking(true) : mutation.mutate({ teamId, slug: trimmed || null })
						}
						sx={{ minHeight: 44, borderRadius: 2, whiteSpace: "nowrap" }}
					>
						{mutation.isPending ? "Saving…" : trimmed ? "Assign" : "Clear"}
					</Button>
				</Stack>
			</Stack>
			<ConfirmDialog
				open={asking}
				title={trimmed ? `Move ${slug} to ${trimmed}?` : `Withdraw ${slug}?`}
				description={`${slug}'s address stops working at once: installed apps, bookmarks and links shared with the team go dead${trimmed ? `, and the app moves to ${trimmed}` : ""}.`}
				confirmLabel={trimmed ? "Move" : "Withdraw"}
				pending={mutation.isPending}
				onClose={() => setAsking(false)}
				onConfirm={() => {
					setAsking(false);
					mutation.mutate({ teamId, slug: trimmed || null });
				}}
			/>
		</Card>
	);
}
