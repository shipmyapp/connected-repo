import { env } from "@frontend/configs/env.config";
import pkg from "../../package.json";

// Prefer the explicit release tag baked in at build time (Sentry release,
// e.g. `frontend@0.2.3-<sha>`) so what the user sees matches what shows up
// in Sentry. Fall back to package.json so it never renders empty in dev.
export const APP_VERSION: string = env.VITE_SENTRY_RELEASE?.split("@").pop() || pkg.version;
