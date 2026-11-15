import { z } from "zod";

/**
 * The version of the Terms and the Privacy Policy the app shows, as the date
 * the texts took effect. Bump it in the same pull request that changes either
 * text materially (and when a feature starts collecting new personal data,
 * adds a processor or a cookie). Every signed-in person is then asked once to
 * agree again. Only this exact value is accepted by `account.acceptLegal`, so
 * a stale tab cannot record an old version.
 */
export const LEGAL_VERSION = "2026-12-01";

export const acceptLegalInputZod = z.object({ version: z.literal(LEGAL_VERSION) });
export type AcceptLegalInput = z.infer<typeof acceptLegalInputZod>;
