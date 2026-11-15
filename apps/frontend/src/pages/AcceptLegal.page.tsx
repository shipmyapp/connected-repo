import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { describeError } from "@connected-repo/ui-mui/utils/rpc_errors";
import { LEGAL_VERSION } from "@connected-repo/zod-schemas/legal.zod";
import { LegalLinks } from "@frontend/components/LegalLinks";
import { safeNextPath } from "@frontend/utils/account_gate";
import { patchAuthCacheUser } from "@frontend/utils/auth.persistence";
import { orpcFetch } from "@frontend/utils/orpc.client";
import type { sessionOnlyLoader } from "@frontend/utils/session_only.loader";
import { requestFreshSession } from "@frontend/utils/session_refresh.client";
import { signout } from "@frontend/utils/signout.utils";
import { useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import { toast } from "react-toastify";

/** Asked once per LEGAL_VERSION when the project has published its Terms and Privacy Policy. */
export default function AcceptLegalPage() {
	const { user } = useLoaderData<typeof sessionOnlyLoader>();
	const [searchParams] = useSearchParams();
	const [agreeing, setAgreeing] = useState(false);
	const next = safeNextPath(searchParams.get("next"));

	const agree = async () => {
		setAgreeing(true);
		try {
			const result = await orpcFetch.account.acceptLegal(
				{ version: LEGAL_VERSION },
				{ context: { noTeam: true } },
			);
			patchAuthCacheUser({
				legalAcceptedVersion: LEGAL_VERSION,
				legalAcceptedAt: result.legalAcceptedAt,
			});
			// Without it, the session's cookie copy would bring the person back here.
			requestFreshSession();
			window.location.replace(next);
		} catch (error) {
			toast.error(describeError(error));
			setAgreeing(false);
		}
	};

	return (
		<Container maxWidth="sm" sx={{ py: 8 }}>
			<Card sx={{ p: 4, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
				<Stack spacing={3}>
					<Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
						{user.legalAcceptedVersion === null
							? "Before you continue"
							: "We've updated our Terms and Privacy Policy"}
					</Typography>
					<Typography variant="body1" color="text.secondary">
						Please read and agree to continue using the app.
					</Typography>
					<LegalLinks />
					<Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
						<Button variant="contained" disabled={agreeing} onClick={() => void agree()}>
							{agreeing ? "Saving…" : "Agree and continue"}
						</Button>
						<Button variant="text" onClick={() => void signout("clear-cache")}>
							Sign out
						</Button>
					</Stack>
				</Stack>
			</Card>
		</Container>
	);
}
