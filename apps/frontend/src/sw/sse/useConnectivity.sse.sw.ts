import { env } from "@frontend/configs/env.config";
import { getSWProxy } from '@frontend/sw/proxy.sw';
import { orpcFetch } from "@frontend/utils/orpc.client";
import * as Comlink from 'comlink';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SSEStatus } from "./sse.manager.sw";

type DetailedStatus = {
	code: 'NO_WIFI' | 'NO_INTERNET' | 'SERVER_DOWN' | 'RECONNECTING' | 'LIVE_SYNC_DOWN' | 'DATA_SYNCING' | 'OK' | 'AUTH_ERROR' | 'SYNC_FAILURE';
	title: string;
	message: string | null;
}

const HEALTH_CHECK_TIMEOUT = 5000;

export function useConnectivity(userId?: string) {
	const [sseStatus, setSseStatus] = useState<SSEStatus>('disconnected');
	const [hasNetworkInterface, setHasNetworkInterface] = useState(navigator.onLine);
	const [isInternetReachable, setIsInternetReachable] = useState(navigator.onLine);
	const [isServerReachable, setIsServerReachable] = useState(true);
	
	// Connectivity check functions
	const checkActualInternet = useCallback(async () => {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
			await fetch("https://www.google.com/generate_204", { method: "HEAD", mode: "no-cors", signal: controller.signal });
			clearTimeout(timeoutId);
			setIsInternetReachable(true);
			return true;
		} catch {
			setIsInternetReachable(false);
			return false;
		}
	}, []);

	const checkServerHealth = useCallback(async () => {
		try {
			const res = await orpcFetch.health();
			const isOk = res.status === "ok";
			setIsServerReachable(isOk);
			return isOk;
		} catch {
			setIsServerReachable(false);
			return false;
		}
	}, []);

	useEffect(() => {
		if (!userId) return;
		let active = true;

		// 1. Service Worker Sync
		getSWProxy().then(async (proxy) => {
			if (!active) return;
			const sw = proxy as any;
			const initialStatus = await sw.getStatus() as SSEStatus;
			setSseStatus(initialStatus);

			await sw.onStatusChange(Comlink.proxy((status: SSEStatus) => {
				if (active) {
					setSseStatus(status);
					// If SSE is connected or sync-complete, we can definitely assume server and internet are reachable
					if (status === 'connected' || status === 'sync-complete') {
						setIsInternetReachable(true);
						setIsServerReachable(true);
					}
					// If SSE drops, verify why
					else if (status === 'disconnected' || status === 'connection-error') {
						checkActualInternet();
						checkServerHealth();
					}
				}
			}));
			sw.startMonitoring(env.VITE_API_URL, userId).catch((err: unknown) => console.error('[Connectivity] Failed to start monitoring:', err));
		}).catch(err => {
			console.error('[Connectivity] Failed to get SW Proxy:', err);
		});

		// 2. Event Listeners
		const handleOnline = () => {
			setHasNetworkInterface(true);
			checkActualInternet();
			checkServerHealth();
		};
		const handleOffline = () => {
			setHasNetworkInterface(false);
			setIsInternetReachable(false);
			setIsServerReachable(false);
		};

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		// Initial check on mount
		if (navigator.onLine) {
			checkActualInternet();
			checkServerHealth();
		} else {
			handleOffline();
		}

		return () => {
			active = false;
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}, [userId, checkActualInternet, checkServerHealth]);


	/**
	 * The "Stateful Error" Logic
	*/
	// Derived State (Scannable and Reactive)
	const getDetailedStatus = useMemo<DetailedStatus>(() => {
        if (!hasNetworkInterface) return { code: 'NO_WIFI', title: "No Network", message: "Check your Wi-Fi or cables." };
        if (!isInternetReachable) return { code: 'NO_INTERNET', title: "No Internet", message: "Connected to Wi-Fi, but no internet access." };
        if (!isServerReachable) return { code: 'SERVER_DOWN', title: "Server Offline", message: "Our backend is currently unreachable." };
        
        // Non-error states (Banners should be hidden or info-only)
        if (sseStatus === 'sync-complete') return { code: 'OK', title: "Connected", message: null };
        if (sseStatus === 'connected') return { code: 'OK', title: "Connected", message: "Syncing data..." }; // Treat 'connected' as OK for banner purposes
        
        // Error or transitional states
        if (sseStatus === 'connecting') return { code: 'RECONNECTING', title: "Connecting", message: "Establishing live sync..." };
        if (sseStatus === 'auth-error') return { code: 'AUTH_ERROR', title: "Session Expired", message: "Please log in again." };
        if (sseStatus === 'sync-error') return { code: 'SYNC_FAILURE', title: "Sync Issue", message: "Delta sync failed. Retrying..." };
        if (sseStatus === 'connection-error') return { code: 'SERVER_DOWN', title: "Sync Down", message: "Connection lost. Reconnecting..." };
        if (sseStatus === 'disconnected') return { code: 'LIVE_SYNC_DOWN', title: "Sync Paused", message: "Live updates are currently disconnected." };
        
        return { code: 'DATA_SYNCING', title: "Syncing", message: "Syncing data..." };
    }, [hasNetworkInterface, isInternetReachable, isServerReachable, sseStatus]);

	const reconnect = useCallback(async () => {
		try {
			const proxy = await getSWProxy();
			const sw = proxy as any;
			await sw.reconnect();
		} catch (err) {
			console.error('[Connectivity] Failed to trigger reconnect:', err);
		}
	}, []);

	return {
		sseStatus,
		hasNetworkInterface,
		isInternetReachable,
		isServerReachable,
		getDetailedStatus,
		reconnect
	};
}
