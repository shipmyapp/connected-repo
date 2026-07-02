import { NODE_ENV_ZOD } from "@connected-repo/zod-schemas/node_env";
import { object, preprocess, string, url } from "zod";

const optionalString = preprocess(
	(val) => (val === "" ? undefined : val),
	string().optional(),
);
const optionalUrl = preprocess((val) => (val === "" ? undefined : val), url().optional());

// Empty string is a valid production value — signals "same-origin/relative"
// when the frontend is served behind a reverse proxy (Dokploy/nginx setup)
// that forwards /api/* to the backend on the same domain. Consumers must
// tolerate an empty base and build relative URLs.
const apiUrlOrEmpty = preprocess(
	(val) => (val === "" ? undefined : val),
	url("API URL must be a valid URL").optional(),
);

export const envSchemaZod = object({
	VITE_USER_NODE_ENV: NODE_ENV_ZOD,
	VITE_API_URL: apiUrlOrEmpty,
	// Empty in the same-origin Dokploy deploy — consumers fall back to
	// window.location.origin so OAuth callbacks stay on the visible domain.
	VITE_USER_APP_URL: apiUrlOrEmpty,
	VITE_TEST_PASSWORD: string().min(8, "Test password must be at least 8 characters").optional(),
	VITE_OTEL_SERVICE_NAME: string().min(1),
	VITE_SENTRY_DSN: preprocess((val) => (val === "" ? undefined : val), url().optional()),
	VITE_SENTRY_ENV: string().optional(),
	VITE_SENTRY_RELEASE: string().optional(),
	VITE_SENTRY_ORG: string().optional(),
	VITE_SENTRY_PROJECT: string().optional(),
	// Novu — Inbox connects the browser directly to Novu; empty = notification UI hidden.
	VITE_NOVU_APP_IDENTIFIER: optionalString,
	VITE_NOVU_API_URL: optionalUrl,
	VITE_NOVU_SOCKET_URL: optionalString,
	// Firebase Web (for FCM push) — empty = push disabled, other channels still work.
	VITE_FIREBASE_API_KEY: optionalString,
	VITE_FIREBASE_AUTH_DOMAIN: optionalString,
	VITE_FIREBASE_PROJECT_ID: optionalString,
	VITE_FIREBASE_MESSAGING_SENDER_ID: optionalString,
	VITE_FIREBASE_APP_ID: optionalString,
	VITE_FIREBASE_VAPID_KEY: optionalString,
});
