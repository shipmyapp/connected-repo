import { ConfirmDialog } from "@connected-repo/ui-mui/components/ConfirmDialog";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Skeleton } from "@connected-repo/ui-mui/feedback/Skeleton";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Switch } from "@connected-repo/ui-mui/form/Switch";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Divider } from "@connected-repo/ui-mui/layout/Divider";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import type {
	ConnectedApp,
	ConnectedAppScopeDto,
} from "@connected-repo/zod-schemas/connected_app.zod";
import { CONNECTED_APPS_COPY } from "@frontend/modules/connected-apps/connected-apps.copy";
import { useTenant } from "@frontend/tenant/TenantContext";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

const NARROWABLE: ConnectedAppScopeDto[] = ["write"];

const when = (ms: number): string => new Date(ms).toLocaleString();

function HowToConnect() {
	const { brand } = useTenant();
	const query = useQuery(orpc.connectedApps.address.queryOptions());
	const address = query.data?.url;
	if (!address) return null;
	return (
		<Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "background.default" }}>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
				{CONNECTED_APPS_COPY.howToConnect(brand.appName)}
			</Typography>
			<Stack direction="row" spacing={1} alignItems="center">
				<Typography
					variant="body2"
					fontFamily="monospace"
					sx={{ flexGrow: 1, wordBreak: "break-all" }}
					data-testid="connected-apps-address"
				>
					{address}
				</Typography>
				<Button
					size="small"
					variant="outlined"
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(address);
							toast.success(CONNECTED_APPS_COPY.addressCopied);
						} catch {
							// The address is on screen to copy by hand.
						}
					}}
				>
					{CONNECTED_APPS_COPY.copyAddress}
				</Button>
			</Stack>
		</Box>
	);
}

function AppRow({ app }: { app: ConnectedApp }) {
	const queryClient = useQueryClient();
	const [isConfirming, setIsConfirming] = useState(false);
	const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.connectedApps.list.key() });
	const disconnect = useMutation(
		orpc.connectedApps.disconnect.mutationOptions({
			onSuccess: async () => {
				setIsConfirming(false);
				toast.success(CONNECTED_APPS_COPY.disconnected(app.platform));
				await refresh();
			},
		}),
	);
	const narrow = useMutation(
		orpc.connectedApps.setScopes.mutationOptions({
			onSuccess: async () => {
				toast.success(CONNECTED_APPS_COPY.narrowed);
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const title = app.isKnownPlatform
		? app.platform
		: `${app.platform} (${CONNECTED_APPS_COPY.unverified})`;
	return (
		<Stack spacing={1.25} sx={{ py: 1.5 }} data-testid="connected-app">
			<Stack direction="row" spacing={1.5} alignItems="center">
				<Box sx={{ flexGrow: 1, minWidth: 0 }}>
					<Typography variant="body1" fontWeight={600} noWrap>
						{title}
					</Typography>
					<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
						{[
							app.host,
							app.lastUsedAt
								? CONNECTED_APPS_COPY.lastUsed(when(app.lastUsedAt))
								: CONNECTED_APPS_COPY.neverUsed,
							CONNECTED_APPS_COPY.changes(app.actionsLast30Days),
						].join(" · ")}
					</Typography>
				</Box>
				<Button
					color="error"
					size="small"
					disabled={disconnect.isPending}
					onClick={() => {
						disconnect.reset();
						setIsConfirming(true);
					}}
				>
					{CONNECTED_APPS_COPY.disconnect}
				</Button>
			</Stack>
			<Box>
				<Typography variant="overline" color="text.secondary" component="p">
					{CONNECTED_APPS_COPY.mayTitle}
				</Typography>
				<Typography variant="body2">{CONNECTED_APPS_COPY.scopeLabel.read}</Typography>
				{NARROWABLE.filter((scope) => app.scopes.includes(scope)).map((scope) => (
					<Stack key={scope} direction="row" spacing={1} alignItems="center" sx={{ minHeight: 44 }}>
						<Typography variant="body2" sx={{ flexGrow: 1 }}>
							{CONNECTED_APPS_COPY.scopeLabel[scope]}
						</Typography>
						<Switch
							checked
							disabled={narrow.isPending}
							onChange={() =>
								narrow.mutate({
									clientId: app.clientId,
									scopes: app.scopes.filter((entry) => entry !== scope),
								})
							}
							slotProps={{ input: { "aria-label": CONNECTED_APPS_COPY.scopeLabel[scope] } }}
						/>
					</Stack>
				))}
				{NARROWABLE.some((scope) => !app.scopes.includes(scope)) && (
					<Typography variant="caption" color="text.secondary">
						{CONNECTED_APPS_COPY.addBackHint}
					</Typography>
				)}
			</Box>
			{app.recent.length > 0 && (
				<Box>
					<Typography variant="overline" color="text.secondary" component="p">
						{CONNECTED_APPS_COPY.recentTitle}
					</Typography>
					{app.recent.map((action) => (
						<Typography key={action.id} variant="body2" color="text.secondary">
							{action.what} · {when(action.at)}
						</Typography>
					))}
				</Box>
			)}
			<ConfirmDialog
				open={isConfirming}
				title={CONNECTED_APPS_COPY.disconnectTitle(app.platform)}
				description={CONNECTED_APPS_COPY.disconnectConfirm}
				confirmLabel={CONNECTED_APPS_COPY.disconnect}
				pendingLabel={CONNECTED_APPS_COPY.disconnecting}
				pending={disconnect.isPending}
				error={disconnect.error?.message ?? null}
				onClose={() => setIsConfirming(false)}
				onConfirm={() => disconnect.mutate({ clientId: app.clientId })}
			/>
		</Stack>
	);
}

/**
 * Connected apps (ADR-045): an AI app is not a device. It outlives signing
 * out, works with the permissions it was given, and is disconnected, not
 * signed out. Online only (oRPC query, no local table).
 */
export const ConnectedAppsCard = () => {
	const apps = useQuery(orpc.connectedApps.list.queryOptions());
	return (
		<Card
			sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}
			data-testid="connected-apps"
		>
			<Typography variant="h6" fontWeight={700}>
				{CONNECTED_APPS_COPY.section}
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				{CONNECTED_APPS_COPY.sectionInfo}
			</Typography>
			{apps.isPending && <Skeleton variant="rounded" height={52} />}
			{apps.isError && (
				<Alert
					severity="error"
					action={
						<Button color="inherit" size="small" onClick={() => apps.refetch()}>
							{CONNECTED_APPS_COPY.retry}
						</Button>
					}
				>
					{CONNECTED_APPS_COPY.loadError}
				</Alert>
			)}
			{apps.data?.length === 0 && (
				<Typography variant="body2">{CONNECTED_APPS_COPY.none}</Typography>
			)}
			<Stack divider={<Divider flexItem />}>
				{apps.data?.map((app) => (
					<AppRow key={app.clientId} app={app} />
				))}
			</Stack>
			<Box sx={{ pt: 1.5 }}>
				<HowToConnect />
			</Box>
		</Card>
	);
};
