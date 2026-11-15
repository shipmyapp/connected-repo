import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Skeleton } from "@connected-repo/ui-mui/feedback/Skeleton";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Switch } from "@connected-repo/ui-mui/form/Switch";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import {
	CONNECTED_APP_SCOPE_ENUM,
	type ConnectedAppScopeDto,
} from "@connected-repo/zod-schemas/connected_app.zod";
import {
	consentRedirectTarget,
	isAcceptableRedirectUri,
} from "@connected-repo/zod-schemas/redirect_uri.utils";
import { CONNECTED_APPS_COPY } from "@frontend/modules/connected-apps/connected-apps.copy";
import { useTenant } from "@frontend/tenant/TenantContext";
import { authClient } from "@frontend/utils/auth.client";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

const isScope = (value: string): value is ConnectedAppScopeDto =>
	(CONNECTED_APP_SCOPE_ENUM as readonly string[]).includes(value);

type ConsentReply = { redirect?: boolean; url?: string };

/**
 * The consent screen (ADR-045): an AI app asked to work on this account.
 * Says which platform it is (by where the sign-in returns to, which it
 * cannot fake), what it may do (read always; write is the person's choice),
 * and hands the answer to Better Auth, which answers with where the browser
 * goes next: only ever a URL on this request's own redirect URI.
 */
export default function OAuthConsentPage() {
	const [params] = useSearchParams();
	const { brand } = useTenant();
	const clientId = params.get("client_id") ?? "";
	const redirectUri = params.get("redirect_uri") ?? "";
	const isRedirectAcceptable = isAcceptableRedirectUri(redirectUri);
	const requested = useMemo(() => (params.get("scope") ?? "").split(" ").filter(Boolean), [params]);
	const offered = requested.filter(isScope);
	const [allowed, setAllowed] = useState<Set<ConnectedAppScopeDto>>(() => new Set(offered));
	const [isBusy, setIsBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const app = useQuery({
		...orpc.connectedApps.describe.queryOptions({ input: { clientId, redirectUri } }),
		enabled: Boolean(clientId && isRedirectAcceptable),
		retry: false,
	});

	const fail = () => {
		setIsBusy(false);
		setError(CONNECTED_APPS_COPY.consentError);
	};

	const answer = async (accept: boolean) => {
		setIsBusy(true);
		setError(null);
		// Read is part of any connection; offline_access (staying connected) passes through.
		const scope = requested
			.filter((entry) => !isScope(entry) || entry === "read" || allowed.has(entry))
			.join(" ");
		try {
			const reply = await authClient.$fetch<ConsentReply>("/oauth2/consent", {
				method: "POST",
				body: { accept, scope, oauth_query: window.location.search.slice(1) },
			});
			// Only to this request's own redirect URI (scheme, host, port, path),
			// and only an https or loopback one: never a URL the reply could
			// otherwise name (javascript:, data:, another host).
			const target = consentRedirectTarget(reply.data?.url ?? "", redirectUri);
			if (!target) {
				fail();
				return;
			}
			window.location.assign(target);
		} catch {
			fail();
		}
	};

	const toggle = (scope: ConnectedAppScopeDto) =>
		setAllowed((current) => {
			const next = new Set(current);
			if (next.has(scope)) next.delete(scope);
			else next.add(scope);
			return next;
		});

	const isValidRequest = Boolean(clientId) && isRedirectAcceptable;

	return (
		<Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 } }}>
			<Paper
				elevation={0}
				sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}
			>
				{app.isPending && isValidRequest && <Skeleton variant="rounded" height={220} />}
				{(app.isError || !isValidRequest) && (
					<Alert severity="error">{CONNECTED_APPS_COPY.consentLoadError}</Alert>
				)}
				{app.data && isValidRequest && (
					<Stack spacing={2.5} data-testid="oauth-consent">
						<Box>
							<Typography variant="h5" component="h1" fontWeight={800} gutterBottom>
								{CONNECTED_APPS_COPY.consentTitle(app.data.platform, brand.appName)}
							</Typography>
							<Typography variant="body2" color="text.secondary">
								{CONNECTED_APPS_COPY.consentReturnsTo(app.data.host)}
							</Typography>
						</Box>
						{!app.data.isKnownPlatform && (
							<Alert severity="warning">
								{CONNECTED_APPS_COPY.consentUnverified(app.data.name ?? app.data.platform)}
							</Alert>
						)}
						<Typography variant="body1">{CONNECTED_APPS_COPY.consentLead}</Typography>
						<Box>
							<Typography variant="subtitle1" component="h2" fontWeight={700} gutterBottom>
								{CONNECTED_APPS_COPY.consentAllowTitle}
							</Typography>
							<Stack spacing={1}>
								{offered.map((scope) => (
									<Stack
										key={scope}
										direction="row"
										spacing={1.5}
										alignItems="center"
										sx={{ minHeight: 48 }}
									>
										<Typography variant="body2" sx={{ flexGrow: 1 }}>
											{CONNECTED_APPS_COPY.scopeLabel[scope]}
										</Typography>
										{scope === "read" ? (
											<Typography variant="caption" color="text.secondary">
												{CONNECTED_APPS_COPY.consentAlways}
											</Typography>
										) : (
											<Switch
												checked={allowed.has(scope)}
												onChange={() => toggle(scope)}
												slotProps={{
													input: { "aria-label": CONNECTED_APPS_COPY.scopeLabel[scope] },
												}}
											/>
										)}
									</Stack>
								))}
							</Stack>
						</Box>
						<Typography variant="body2" color="text.secondary">
							{CONNECTED_APPS_COPY.consentNever}
						</Typography>
						{error && (
							<Alert severity="error" role="alert">
								{error}
							</Alert>
						)}
						<Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
							<Button
								variant="contained"
								disabled={isBusy}
								onClick={() => void answer(true)}
								sx={{ minHeight: 48, flexGrow: 1 }}
							>
								{isBusy ? CONNECTED_APPS_COPY.connecting : CONNECTED_APPS_COPY.connect}
							</Button>
							<Button
								color="inherit"
								disabled={isBusy}
								onClick={() => void answer(false)}
								sx={{ minHeight: 48 }}
							>
								{CONNECTED_APPS_COPY.cancel}
							</Button>
						</Stack>
					</Stack>
				)}
			</Paper>
		</Container>
	);
}
