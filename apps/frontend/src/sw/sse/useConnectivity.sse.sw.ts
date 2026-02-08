import { env } from "@frontend/configs/env.config";
import { getSWProxy } from '@frontend/sw/proxy.sw';
import * as Comlink from 'comlink';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type SSEStatus = 'connected' | 'disconnected' | 'connecting';

type DetailedStatus = {
	code: 'NO_WIFI' | 'NO_INTERNET' | 'SERVER_DOWN' | 'RECONNECTING' | 'LIVE_SYNC_DOWN' | 'OK';
	title: string;
	message: string | null;
}

const HEALTH_CHECK_TIMEOUT = 5000;

export function useConnectivity() {
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
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
			const res = await fetch(`${env.VITE_API_URL}/user-app/health`, { 
					method: "GET", 
					credentials: "include", 
					signal: controller.signal 
			});
			clearTimeout(timeoutId);
			const isOk = res.ok;
			setIsServerReachable(isOk);
			return isOk;
		} catch {
			setIsServerReachable(false);
			return false;
		}
	}, []);

	useEffect(() => {
		let active = true;

		// 1. Service Worker Sync
		getSWProxy().then(async (sw) => {
			if (!active) return;
			const initialStatus = await sw.getStatus();
			setSseStatus(initialStatus);

			await sw.onStatusChange(Comlink.proxy((status) => {
				if (active) {
					setSseStatus(status);
					// If SSE is connected, we can assume server and internet are reachable
					if (status === 'connected') {
						setIsInternetReachable(true);
						setIsServerReachable(true);
					}
					// If SSE drops, immediately verify why
					else if (status === 'disconnected') {
						checkActualInternet();
						checkServerHealth();
					}
				}
			}));
			sw.startMonitoring(env.VITE_API_URL).catch((err) => console.error('[Connectivity] Failed to start monitoring:', err));
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
	}, [checkActualInternet, checkServerHealth]);


	/**
	 * The "Stateful Error" Logic
	*/
	// Derived State (Scannable and Reactive)
	const getDetailedStatus = useMemo<DetailedStatus>(() => {
        if (!hasNetworkInterface) return { code: 'NO_WIFI', title: "No Network", message: "Check your Wi-Fi or cables." };
        if (!isInternetReachable) return { code: 'NO_INTERNET', title: "No Internet", message: "Connected to Wi-Fi, but no internet access." };
        if (!isServerReachable) return { code: 'SERVER_DOWN', title: "Server Offline", message: "Our backend is currently unreachable." };
        if (sseStatus === 'connecting') return { code: 'RECONNECTING', title: "Connecting", message: "Syncing live data..." };
        if (sseStatus === 'disconnected') return { code: 'LIVE_SYNC_DOWN', title: "Sync Paused", message: "Live updates are currently disconnected." };
        return { code: 'OK', title: "Connected", message: null };
    }, [hasNetworkInterface, isInternetReachable, isServerReachable, sseStatus]);

	const reconnect = useCallback(async () => {
		try {
			const sw = await getSWProxy();
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
