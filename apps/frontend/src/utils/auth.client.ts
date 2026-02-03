import { themeSettingZod } from "@connected-repo/zod-schemas/enums.zod";
import { zTimezone } from "@connected-repo/zod-schemas/zod_utils";
import { env } from "@frontend/configs/env.config";
import { createAuthClient } from "better-auth/client";
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