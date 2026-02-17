/*
 * Copyright (c) 2025 Hexatech Hub Solutions LLP, India
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import App from "@frontend/App.tsx";
import { queryClient } from "@frontend/utils/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Defensive mounting: ensure the root element exists and create the root
// only once. This pattern is compatible with React 18/19 root API and is
// resilient for incremental upgrades and hydration strategies.
const container = document.getElementById("root");
if (!container) {
	throw new Error("Root element with id \"root\" not found");
}

const root = createRoot(container, {
  // Simple error logging until Sentry loads
  onUncaughtError: (error, errorInfo) => {
    console.error('Uncaught error:', error, errorInfo.componentStack);
  },
});;

root.render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
				<App />
		</QueryClientProvider>
	</StrictMode>,
);

const startDeferredTasks = () => {

  // Wait one frame to ensure root.render() has settled visually
  requestAnimationFrame(() => {
    document.body.classList.add('app-mounted');
  });

  // Initialize PWA and background tasks after the critical path
  import('./pwa-init').then(m => m.initPWA());

  // Initialize Sentry/Instrumentation lazily
  import('./instrumentation').then(m => m.initInstrumentation());
};

if ('requestIdleCallback' in window) {
  (window as any).requestIdleCallback(() => startDeferredTasks());
} else {
  setTimeout(startDeferredTasks, 2000); // Fallback for browsers without idle support
}