import {
	blankAsUndefined,
	optionalSampleRate,
	optionalString,
	optionalUrl,
} from "@connected-repo/zod-schemas/env_utils";
import { NODE_ENV_ZOD } from "@connected-repo/zod-schemas/node_env";
import { object, preprocess, string, url } from "zod";

// Empty string is a valid production value — signals "same-origin/relative"
// when the frontend is served behind a reverse proxy (Dokploy/nginx setup)
// that forwards /api/* to the backend on the same domain. Consumers must
// tolerate an empty base and build relative URLs.
const apiUrlOrEmpty = preprocess(blankAsUndefined, url("API URL must be a valid URL").optional());

export const envSchemaZod = object({
	VITE_USER_NODE_ENV: NODE_ENV_ZOD,
	VITE_API_URL: apiUrlOrEmpty,
	// Empty in the same-origin Dokploy deploy — consumers fall back to
	// window.location.origin so OAuth callbacks stay on the visible domain.
	VITE_USER_APP_URL: apiUrlOrEmpty,
	// Root domain of team hosts: `<slug>.<root>` is one team's private PWA,
	// `app.<root>` / `<root>` the shared app. Must equal the backend's
	// TENANT_ROOT_DOMAIN. Empty = tenant mode off.
	VITE_TENANT_ROOT_DOMAIN: optionalString,
	// Tests only. Empty = unset, so a deploy that blanks it still builds.
	VITE_TEST_PASSWORD: preprocess(
		blankAsUndefined,
		string().min(8, "Test password must be at least 8 characters").optional(),
	),
	VITE_OTEL_SERVICE_NAME: preprocess(blankAsUndefined, string().min(1).default("frontend")),
	VITE_SENTRY_DSN: optionalUrl,
	VITE_SENTRY_ENV: optionalString,
	VITE_SENTRY_RELEASE: optionalString,
	VITE_SENTRY_ORG: optionalString,
	VITE_SENTRY_PROJECT: optionalString,
	// Sampling knobs; empty keeps the defaults in instrumentation.ts.
	VITE_SENTRY_TRACES_SAMPLE_RATE: optionalSampleRate,
	VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: optionalSampleRate,
	VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: optionalSampleRate,
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
	// Where the project publishes its Terms and Privacy Policy (docs/legal/ holds
	// skeletons). Both set: sign-in and profile link them and every account is
	// asked to agree once per LEGAL_VERSION. Either blank: no links, no question.
	VITE_TERMS_URL: optionalUrl,
	VITE_PRIVACY_URL: optionalUrl,
});
