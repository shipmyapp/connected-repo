import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";

// The superadmin console. A plain SPA: no PWA, no service worker, no Sentry.
// It calls /api/* on its own origin, proxied to the backend here in dev and
// by its nginx in production.
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd());
	const devBackendProxyTarget = env.VITE_DEV_BACKEND_PROXY_TARGET || "http://localhost:3000";

	return {
		base: "/",
		server: {
			// 5173 is the frontend and 5174 its Playwright preview; the backend's
			// ALLOWED_ORIGINS must list this origin for Better Auth to accept the
			// sign-in requests.
			port: 5175,
			strictPort: true,
			proxy: {
				"/api": { target: devBackendProxyTarget, changeOrigin: true },
			},
		},
		preview: { port: 4175, strictPort: true },
		plugins: [react()],
		resolve: {
			alias: {
				"@superadmin": path.resolve(__dirname, "./src"),
				"@backend": path.resolve(__dirname, "../backend/src"),
			},
			// One copy of React, emotion and MUI even though
			// `@connected-repo/ui-mui` is linked in from the workspace (see
			// apps/frontend/vite.config.ts).
			dedupe: [
				"react",
				"react-dom",
				"react/jsx-runtime",
				"react/jsx-dev-runtime",
				"@emotion/react",
				"@emotion/styled",
				"@mui/material",
				"@mui/system",
				"@mui/icons-material",
			],
		},
		build: { sourcemap: true },
	};
});
