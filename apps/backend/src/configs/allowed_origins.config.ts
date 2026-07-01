import { env } from "@backend/configs/env.config";

// Remove trailing slashes from origins (origins should never have trailing slashes)
export const allowedOrigins = (env.ALLOWED_ORIGINS?.split(",") || []).filter(
	(origin) => origin.length > 0,
);
