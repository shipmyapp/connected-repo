/*
 * Copyright (c) 2025 Hexatech Hub Solutions LLP, India
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import "./instrumentation";

import App from "@frontend/App.tsx";
import { env } from "@frontend/configs/env.config";
import { queryClient } from "@frontend/utils/queryClient";
import { dataWorkerClient } from "@frontend/worker/worker.client";
import * as Sentry from "@sentry/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Initialize the data Worker early (before render) so it's ready for queries.
dataWorkerClient.initialize(env.VITE_API_URL).catch((err) => {
	console.error("Failed to initialize data worker:", err);
});

// Initialize PWA Service Worker communication
if ('serviceWorker' in navigator) {
	// Send INIT_SYNC when the service worker is ready and controlling the page
	navigator.serviceWorker.ready.then((registration) => {
		console.log('[Main] SW ready:', registration);
		const sendInit = () => {
			if (navigator.serviceWorker.controller) {
				console.log('[Main] Sending INIT_SYNC to active SW controller');
				navigator.serviceWorker.controller.postMessage({
					type: 'INIT_SYNC',
					payload: { apiUrl: env.VITE_API_URL }
				});
			}
		};

		sendInit();
		
		// Also listen for controllerchange to re-init if SW updates
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			console.log('[Main] SW controller changed, re-sending INIT_SYNC');
			sendInit();
		});
	});

	// Bridge messages from Service Worker to Data Worker
	navigator.serviceWorker.addEventListener('message', (event) => {
		console.log('[Main] Received message from SW:', event.data?.type);
		if (event.data && event.data.type === 'SYNC_UPDATE') {
			console.log('[Main] Bridging SYNC_UPDATE from SW to Worker');
			dataWorkerClient.forwardFromSw(event.data.payload);
		} else if (event.data && event.data.type === 'SSE_STATUS_UPDATE') {
			console.log('[Main] Bridging SSE_STATUS_UPDATE from SW to Worker:', event.data.payload.status);
			dataWorkerClient.forwardEventFromSw('sse-status-change', event.data.payload);
		}
	});
}

// Defensive mounting: ensure the root element exists and create the root
// only once. This pattern is compatible with React 18/19 root API and is
// resilient for incremental upgrades and hydration strategies.
const container = document.getElementById("root");
if (!container) {
	throw new Error("Root element with id \"root\" not found");
}

const root = createRoot(container, {
  // Callback called when an error is thrown and not caught by an ErrorBoundary.
  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
    console.warn('Uncaught error', error, errorInfo.componentStack);
  }),
  // Callback called when React catches an error in an ErrorBoundary.
  onCaughtError: Sentry.reactErrorHandler(),
  // Callback called when React automatically recovers from errors.
  onRecoverableError: Sentry.reactErrorHandler(),
});;

root.render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
				<App />
		</QueryClientProvider>
	</StrictMode>,
);
