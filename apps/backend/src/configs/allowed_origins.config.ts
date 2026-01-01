import { env } from "@backend/configs/env.config";

export const allowedOrigins = [...(env.ALLOWED_ORIGINS?.split(",") || [])];