import { themeSettingZod } from "@connected-repo/zod-schemas/enums.zod";
import { zTimezone } from "@connected-repo/zod-schemas/zod_utils";
import { env } from "@frontend/configs/env.config";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { uniqueTimeArrayZod } from "../../../../packages/zod-schemas/src/zod_utils";

export const authClient = createAuthClient({
  baseURL: env.VITE_API_URL,
   plugins: [
    inferAdditionalFields({
      user: {
          timezone: {
            defaultValue: "Etc/UTC",
            input: true,
            required: true,
            type: "string",
            validator: {
              input: zTimezone,
              output: zTimezone
            }
          },
          themeSetting: {
            type: "string",
            required: true,
            defaultValue: "system",
            input: true,
            validator: {
              input: themeSettingZod,
              output: themeSettingZod
            }
          },
          journalReminderTimes: {
            type: "string[]",
            required: true,
            defaultValue: [],
            input: true,
            validator: {
              input: uniqueTimeArrayZod,
              output: uniqueTimeArrayZod,
            }
          }
      }
    }),
  ]
});

export const SESSION_CACHE_KEY = "connected-repo-session";

export const authClientGetSession = async () => {

		let session = null;
    let error = null;
		try {
			const sessionResponse = await authClient.getSession();
      session = sessionResponse.data;
      error = sessionResponse.error;
      if(!error) localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
		} catch (e) {
			console.warn("[AuthLoader] getSession threw an error (likely network failure):", e);
      error = e;
		}

    if (error || !session) {
			console.log("[AuthLoader] No session found, trying to recover from localStorage");
			// Try to recover from localStorage if offline or server error
			const cachedSession = localStorage.getItem(SESSION_CACHE_KEY);
			if (cachedSession) {
				try {
					session = JSON.parse(cachedSession);
					console.log("[AuthLoader] Using cached session from localStorage");
				} catch (e) {
					console.error("[AuthLoader] Failed to parse cached session", e);
				}
			}
		};

		return session;
}