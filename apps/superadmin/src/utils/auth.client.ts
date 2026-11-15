import { apiOrigin } from "@superadmin/configs/env.config";
import { createAuthClient } from "better-auth/client";

/**
 * The same Better Auth backend as the app (`/api/auth/*`, Google). The
 * console has no accounts of its own: anyone can sign in, only accounts on
 * the backend's SUPER_ADMIN_EMAILS / SUPER_ADMIN_PHONE_NUMBERS get past `ping`.
 */
export const authClient = createAuthClient({ baseURL: apiOrigin });
