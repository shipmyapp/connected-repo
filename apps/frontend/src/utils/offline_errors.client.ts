import { ulid } from "ulid";
import { clientDb } from "../worker/db/db.manager";
import { getAuthCache, getLastLogin } from "./auth.persistence";
import { OfflineErrorInsert } from "@connected-repo/zod-schemas/offline_errors.zod";

/**
 * Persists a client-side error to IndexedDB for background telemetry syncing.
 * This is a fire-and-forget method explicitly designed to never throw or block.
 */
export const logOfflineError = async (
  error: unknown,
  context: string,
): Promise<void> => {
  try {
    // 1. Filter out common UI noise that does not signify app failures
    if (error instanceof Error) {
      if (
        error.message.includes("No Internet") ||
        error.name === "AbortError" ||
        error.message.includes("offline")
      ) {
        return; // Ignore network/abort noise
      }
    }

    // 2. Extract error payload safely
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const inBrowser = typeof window !== "undefined";

    // 3. Collect Client Details
    const { userAgent } = navigator;
    const deviceInfo = [
      navigator.platform,
      navigator.vendor,
      inBrowser && window.innerWidth ? `${window.innerWidth}x${window.innerHeight}` : "Worker Profile",
    ]
      .filter(Boolean)
      .join(" | ");

    // Using Vite ENV variables for app version if available, otherwise "unknown"
    const appVersion = import.meta.env.VITE_APP_VERSION || "unknown";

    // Grab cached auth data if available (methods handle localStorage errors gracefully)
    const authCache = getAuthCache();
    const lastLogin = getLastLogin();
    
    let clientId = authCache?.user?.id;
    let userEmail = authCache?.user?.email || lastLogin?.email;

    let teamId: string | undefined = undefined;
    if (clientId) {
      if (inBrowser) {
        try {
          const workspaceData = localStorage.getItem(`activeWorkspace_${clientId}`);
          if (workspaceData) {
            const workspace = JSON.parse(workspaceData);
            if (workspace.type === "team") teamId = workspace.id;
          }
        } catch (e) {
          // ignore ReferenceError or JSON parse errors
        }
      }
    }

    const errorRecord: OfflineErrorInsert = {
      id: ulid(),
      timestamp: new Date().toISOString(),
      message,
      stack,
      context,
      userAgent,
      deviceInfo,
      appVersion,
      clientId: clientId || undefined,
      teamId: teamId || undefined,
      userEmail: userEmail || undefined,
    };

    // 4. Save to Dexie
    if (clientDb.offlineErrors) {
      await clientDb.offlineErrors.add(errorRecord);
    } else if ((clientDb as any).clientErrors) {
      await (clientDb as any).clientErrors.add(errorRecord);
    }
  } catch (storageError) {
    // Failsafe: if telemetry itself fails, log to console but don't propagate.
    // We do NOT want error tracking to break the app sequence.
    console.error("[Telemetry] Failed to log error", storageError, error);
  }
};
