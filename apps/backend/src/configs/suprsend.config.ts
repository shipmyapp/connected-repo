import { env } from "@backend/configs/env.config"
import { Suprsend } from "@suprsend/node-sdk"

export const suprClient = new Suprsend(env.SUPRSEND_API_KEY, env.SUPRSEND_API_SECRET)