import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { env } from "@frontend/configs/env.config";
import { Link } from "@mui/material";

/** Both documents have an address: links show and the agreement step runs. */
export const isLegalConfigured = (): boolean => Boolean(env.VITE_TERMS_URL && env.VITE_PRIVACY_URL);

/**
 * "Terms of Service · Privacy Policy" from VITE_TERMS_URL / VITE_PRIVACY_URL,
 * opening in a new tab; with either unset, the lead sentence alone (or
 * nothing).
 */
export function LegalLinks({ lead }: { lead?: string }) {
	const textSx = { color: "text.secondary", m: 0, textAlign: "center" } as const;
	if (!isLegalConfigured()) {
		return lead ? (
			<Typography variant="caption" component="p" sx={textSx}>
				{lead} Terms of Service and Privacy Policy.
			</Typography>
		) : null;
	}
	const linkSx = { color: "inherit", textDecorationColor: "currentColor" } as const;
	return (
		<Typography variant="caption" component="p" sx={textSx}>
			{lead ? `${lead} ` : null}
			<Link href={env.VITE_TERMS_URL} target="_blank" rel="noopener noreferrer" sx={linkSx}>
				Terms of Service
			</Link>
			{lead ? " and " : " · "}
			<Link href={env.VITE_PRIVACY_URL} target="_blank" rel="noopener noreferrer" sx={linkSx}>
				Privacy Policy
			</Link>
			{lead ? "." : null}
		</Typography>
	);
}
