import * as Comlink from 'comlink';
import type { SSEManager } from './sse/sse.manager.sw';

let proxy: Comlink.Remote<SSEManager> | null = null;
const waiters = new Set<(p: Comlink.Remote<SSEManager>) => void>();

async function waitForController() {
	if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
	return new Promise<ServiceWorker>((resolve) => {
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (navigator.serviceWorker.controller) resolve(navigator.serviceWorker.controller);
		}, { once: true });
	});
}

async function init() {
	try {
		await navigator.serviceWorker.ready;
		
		// Wait for the controller to be available (handles the activation race)
		const controller = await waitForController();
		
		if (!controller) {
			console.warn('[SW Proxy] No service worker controller available after waiting');
			return;
		}

		const channel = new MessageChannel();
		controller.postMessage({ type: 'CAN_HAS_COMLINK' }, [channel.port2]);
		proxy = Comlink.wrap<SSEManager>(channel.port1);
		
		waiters.forEach(cb => { cb(proxy!); });
		waiters.clear();
	} catch (err) {
		console.error('[SW Proxy] Initialization failed:', err);
	}
}

if (typeof window !== 'undefined') {
	init();
}

const SW_PROXY_TIMEOUT = 10000; // 10 seconds

export const getSWProxy = () => {
	if (proxy) {
		return Promise.resolve(proxy);
	}
	
	// 10-second timeout that rejects the promise if controller is not available
	return new Promise<Comlink.Remote<SSEManager>>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			waiters.delete(waiter);
			reject(new Error('Service worker proxy timeout: controller not available'));
		}, SW_PROXY_TIMEOUT);
		
		const waiter = (p: Comlink.Remote<SSEManager>) => {
			clearTimeout(timeoutId);
			resolve(p);
		};
		
		waiters.add(waiter);
	});
};
