import { env } from "@backend/configs/env.config";
import { Novu } from "@novu/api";

// `novu` is null when NOVU_SECRET_KEY is unset so the boilerplate boots
// without notifications configured (e.g. CI, local dev without an account).
export const novu = env.NOVU_SECRET_KEY
	? new Novu({
			secretKey: env.NOVU_SECRET_KEY,
			serverURL: env.NOVU_API_URL,
		})
	: null;
