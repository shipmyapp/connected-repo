import { env } from "@frontend/configs/env.config";
import pkg from "../../package.json";

/** The release version a person can repeat (package.json). */
export const APP_VERSION: string = pkg.version;

/** The commit this build came from, when the deploy passed one in (`VITE_SENTRY_RELEASE`, `name@<commit>`); matches the Sentry release. */
export const APP_COMMIT: string | null = env.VITE_SENTRY_RELEASE?.split("@").pop() || null;
