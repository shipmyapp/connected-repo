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
import { queryClient } from "@frontend/utils/queryClient";
import * as Sentry from "@sentry/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';

// Register service worker for PWA functionality
registerSW({
  onRegistered(r: ServiceWorkerRegistration | undefined) {
    console.info('SW registered: ', r);
  },
  onRegisterError(error: unknown) {
    console.error('SW registration failed: ', error);
  },
});

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
