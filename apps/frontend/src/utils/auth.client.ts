import { themeSettingZod } from "@connected-repo/zod-schemas/enums.zod";
import { zTimezone } from "@connected-repo/zod-schemas/zod_utils";
import { env } from "@frontend/configs/env.config";
import { createAuthClient } from "better-auth/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { uniqueTimeArrayZod } from "../../../../packages/zod-schemas/src/zod_utils";

// Empty VITE_API_URL = same-origin reverse-proxy deploy. Fall back to the
// current page origin so better-auth issues cookies against the visible domain.
const authBaseUrl =
  env.VITE_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : undefined);

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
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
          },
          activeTeamAppId: {
            type: "string",
            required: false,
            defaultValue: null,
            input: false,
          }
      }
    }),
  ]
});