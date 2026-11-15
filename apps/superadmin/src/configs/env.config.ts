import { resolveApiOrigin } from "@connected-repo/ui-mui/utils/api_origin";
import { optionalUrl } from "@connected-repo/zod-schemas/env_utils";
import { z } from "zod";

const envSchemaZod = z.object({
	// Empty = same origin: the Vite proxy (dev) or nginx (prod) forwards /api/*.
	VITE_API_URL: optionalUrl,
});

const env = envSchemaZod.parse(import.meta.env);

/** Absolute origin for backend calls (oRPC's link needs an absolute URL). */
export const apiOrigin = resolveApiOrigin(env.VITE_API_URL, window.location.origin);
