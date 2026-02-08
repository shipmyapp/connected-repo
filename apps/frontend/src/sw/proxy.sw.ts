import * as Comlink from 'comlink';
import type { SSEManager } from './sse/sse.manager.sw';

let proxy: Comlink.Remote<SSEManager> | null = null;
const waiters = new Set<(p: Comlink.Remote<SSEManager>) => void>();

async function init() {
	await navigator.serviceWorker.ready;
	if (!navigator.serviceWorker.controller) {
		// Reject pending waiters if controller is not available
		console.warn('[SW Proxy] No service worker controller available');
		return;
	}

	const channel = new MessageChannel();
	navigator.serviceWorker.controller.postMessage({ type: 'CAN_HAS_COMLINK' }, [channel.port2]);
	proxy = Comlink.wrap<SSEManager>(channel.port1);
	
	waiters.forEach(cb => { cb(proxy!); });
	waiters.clear();
}

if (typeof window !== 'undefined') {
	navigator.serviceWorker.addEventListener('controllerchange', init);
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
