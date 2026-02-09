import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import { analyzer } from 'vite-bundle-analyzer';
import { VitePWA } from 'vite-plugin-pwa';
import { envValidationVitePlugin } from "./src/utils/env_validation_vite_plugin.utils";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd());
	return {
		base: "/",
		worker: {
			format: "es",
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
				openAnalyzer: true,
			}),
			VitePWA({
				strategies: "injectManifest",
				srcDir: "src/sw",
				filename: "sw.js",
				registerType: "prompt",
				injectManifest: {
					swSrc: "src/sw/sw.ts",
					globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
				},
				workbox: {
					cleanupOutdatedCaches: true
				},
				...(env.VITE_USER_NODE_ENV === "development"
					? {
						devOptions: {
							enabled: true,
							type: "module"
						}
					}
					: {}),
				manifest: {
					name: "OneQ",
					short_name: "OneQ",
					start_url: "/",
					display: "standalone",
					background_color: "#ffffff",
					theme_color: "#1976d2",
					icons: [
						{
							src: 'android-chrome-192x192.png',
							sizes: '192x192',
							type: 'image/png',
							purpose: 'any'
						},
						{
							src: 'android-chrome-512x512.png',
							sizes: '512x512',
							type: 'image/png',
							purpose: 'any'
						},
						{
							src: 'maskable-icon-512x512.png',
							sizes: '512x512',
							type: 'image/png',
							purpose: 'maskable'
						},
						{
							src: 'apple-touch-icon.png',
							sizes: '180x180',
							type: 'image/png'
						}
					]
				}
			}),
			// Put the Sentry vite plugin after all other plugins
			sentryVitePlugin({
				org: env.VITE_SENTRY_ORG,
				project: env.VITE_SENTRY_PROJECT,

				// Auth tokens can be obtained from https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/
				authToken: env.VITE_SENTRY_AUTH_TOKEN,
				reactComponentAnnotation: {
					enabled: true,
					// you can ignore components from being annotated with this option
					ignoredComponents: []
				}
			}),
		],
		resolve: {
			alias: {
				'@frontend': path.resolve(__dirname, './src'),
				'@backend': path.resolve(__dirname, '../backend/src'),
			},
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

