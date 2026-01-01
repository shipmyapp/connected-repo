import { env } from "@frontend/configs/env.config";
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: env.VITE_API_URL,
});