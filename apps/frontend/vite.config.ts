import path from "node:path";
import { INSTALL_PICTURES } from "@connected-repo/zod-schemas/install_pictures";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";
import { sentryReleaseName } from "./src/configs/sentry_release.config";
import { envValidationVitePlugin } from "./src/utils/env_validation_vite_plugin.utils";

/**
 * Links into the installed app, where the platform allows:
 * - `handle_links: "preferred"`: Chromium opens the app's links in the installed app.
 * - `launch_handler`: a link opens in the window already open, not a second one.
 * iOS has neither: a link always opens in Safari. `as const` for the manifest type's literal fields.
 */
const LINK_HANDLING = {
	handle_links: "preferred" as const,
	launch_handler: { client_mode: ["navigate-existing" as const, "auto" as const] },
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd());

	// Sentry release name — MUST match Sentry.init's `release` at runtime, else
	// uploaded sourcemaps get tagged with a version the runtime never reports
	// and Sentry silently can't associate errors with them.
	const sentryRelease = sentryReleaseName(
		env.VITE_OTEL_SERVICE_NAME,
		env.VITE_SENTRY_RELEASE,
		pkg.version,
	);

	// Sourcemap upload is guarded by an explicit marker that only the Docker
	// prod build sets (see apps/frontend/Dockerfile). Local `yarn build` will
	// NEVER upload — even if a dev happens to have VITE_SENTRY_AUTH_TOKEN
	// in their .env — because SENTRY_UPLOAD_SOURCEMAPS is unset locally.
	const shouldUploadSourcemaps =
		mode === "production" &&
		process.env.SENTRY_UPLOAD_SOURCEMAPS === "1" &&
		Boolean(env.VITE_SENTRY_AUTH_TOKEN);

	// Dev-only backend origin for the /api proxy below. When a dev sets
	// VITE_API_URL='' (same-origin, matching prod), this is where /api/* gets
	// forwarded. Override via VITE_DEV_BACKEND_PROXY_TARGET if the backend
	// runs somewhere other than :3000 on the host.
	const devBackendProxyTarget = env.VITE_DEV_BACKEND_PROXY_TARGET || "http://localhost:3000";

	return {
		base: "/",
		worker: {
			format: "es",
		},
		// Mirror the prod reverse-proxy layout in host-mode `yarn dev`: the SPA
		// runs on :5173, backend on :3000, and /api/* is same-origin from the
		// browser's POV (matching apps/frontend/nginx.conf.template). Combined
		// with VITE_API_URL='' in .env, oRPC/auth/Novu paths resolve against
		// window.location.origin and get proxied here.
		server: {
			proxy: {
				"/api": {
					target: devBackendProxyTarget,
					changeOrigin: true,
				},
			},
		},
		plugins: [
			envValidationVitePlugin(),
			react(),
			analyzer({
				// analyzerMode: "json",
				// fileName: path.resolve(__dirname, ".dev", "stats.json");,
				// Use the below when output needed is html
				enabled: true,
				analyzerMode: "static",
				fileName: ".dev/stats.html",
				// Never auto-open: fails in Docker builds (no xdg-open) and is
				// noise even locally. Open dist/.dev/stats.html manually.
				openAnalyzer: false,
			}),
			VitePWA({
				strategies: "injectManifest",
				srcDir: "src/sw",
				filename: "sw.js",
				registerType: "prompt",
				injectManifest: {
					swSrc: "src/sw/sw.ts",
					globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
					// The install dialog's chunk is fetched only where it is offered, never by an
					// installed app; the install pictures only when shown.
					globIgnores: ["**/pwa-install*.js", "screenshots/**"],
				},
				workbox: {
					cleanupOutdatedCaches: true,
				},
				...(env.VITE_USER_NODE_ENV === "development"
					? {
							devOptions: {
								enabled: true,
								type: "module",
								suppressWarnings: true,
							},
						}
					: {}),
				manifest: {
					name: "OneQ",
					short_name: "OneQ",
					description:
						"Your journal, with a prompt each day, reminders when you want them, and it works offline.",
					// The app's identity for install (Web Install API, getInstalledRelatedApps). A team's own
					// host serves its own manifest with its own id.
					id: "/",
					scope: "/",
					start_url: "/",
					display: "standalone",
					display_override: ["standalone", "minimal-ui"],
					categories: ["productivity", "lifestyle"],
					// Lets Chromium answer getInstalledRelatedApps for this app itself, so the
					// profile's Install card leaves once it is installed.
					related_applications: [{ platform: "webapp", url: "/manifest.webmanifest" }],
					...LINK_HANDLING,
					lang: "en",
					background_color: "#ffffff",
					theme_color: "#1976d2",
					icons: [
						{
							src: "android-chrome-192x192.png",
							sizes: "192x192",
							type: "image/png",
							purpose: "any",
						},
						{
							src: "android-chrome-512x512.png",
							sizes: "512x512",
							type: "image/png",
							purpose: "any",
						},
						{
							src: "maskable-icon-512x512.png",
							sizes: "512x512",
							type: "image/png",
							purpose: "maskable",
						},
						{ src: "apple-touch-icon.png", sizes: "180x180", type: "image/png" },
					],
					// The install pictures: the install dialog's gallery, Chrome's richer install
					// dialog and the app's own sheet. One list in packages/zod-schemas/src/install_pictures.ts.
					screenshots: INSTALL_PICTURES.map((picture) => ({ ...picture })),
				},
			}),
			// Sentry Vite plugin — only include it when a real prod upload is
			// intended. Conditionally spreading (vs. `disable: true`) keeps its
			// side-effects (network calls, temp files) fully out of local builds.
			// Auth token: https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/
			...(shouldUploadSourcemaps
				? [
						sentryVitePlugin({
							org: env.VITE_SENTRY_ORG,
							project: env.VITE_SENTRY_PROJECT,
							authToken: env.VITE_SENTRY_AUTH_TOKEN,
							release: { name: sentryRelease },
							reactComponentAnnotation: {
								enabled: true,
								ignoredComponents: [],
							},
						}),
					]
				: []),
		],
		resolve: {
			alias: {
				"@frontend": path.resolve(__dirname, "./src"),
				"@backend": path.resolve(__dirname, "../backend/src"),
			},
			// Yarn workspaces link `@connected-repo/ui-mui` in from the
			// monorepo; when its dist code re-imports MUI/emotion/react, Vite
			// can resolve those bare specifiers via a different node_modules
			// path than the app's own imports and end up with TWO module
			// instances at runtime. Symptom in dev (esp. after HMR):
			//   - "You are loading @emotion/react when it is already loaded"
			//   - "Invalid hook call ... more than one copy of React"
			//   - `useContext(null)` inside SvgIcon on /settings/sync.
			// `dedupe` forces every request for these packages to resolve to
			// the single copy hoisted at the workspace root.
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
				"@mui/x-date-pickers",
			],
		},
		build: {
			rollupOptions: {
				output: {
					manualChunks: {
						// react: ['react', 'react-dom'],
						// Add other big libs as needed
						// mui: ['@mui/material'],
						// zod: ['zod'], // '@connected-repo/zod-schemas'],
					},
					// manualChunks(id) {
					//   if (id.includes('zod')) {
					//     console.log('Creating separate chunk for zod-schemas:', id);
					//     return 'zod-schemas';
					//   }
					// }
				},
			},
			sourcemap: true,
		},
	};
});
