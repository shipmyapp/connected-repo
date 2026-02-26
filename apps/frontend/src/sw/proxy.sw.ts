import * as Comlink from 'comlink';
import type { SSEManager } from './sse/sse.manager.sw';
import { ProxyCell } from '../worker/utils/ProxyCell';

const swProxyCell = new ProxyCell<Comlink.Remote<SSEManager>>();

async function waitForController() {
	if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
	
	return new Promise<ServiceWorker>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			reject(new Error('Timeout waiting for Service Worker controller'));
		}, 5000);

		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (navigator.serviceWorker.controller) {
				clearTimeout(timeoutId);
				resolve(navigator.serviceWorker.controller);
			}
		}, { once: true });
	});
}

/**
 * Initializes the Service Worker Comlink bridge.
 */
async function init() {
	if (typeof window === 'undefined') return;
	
	try {
		await navigator.serviceWorker.ready;
		const controller = await waitForController();
		
		if (!controller) {
			console.warn('[SW Proxy] No controller available');
			return;
		}

		const channel = new MessageChannel();
		controller.postMessage({ type: 'CAN_HAS_COMLINK' }, [channel.port2]);
		
		const proxy = Comlink.wrap<SSEManager>(channel.port1);
		console.info('[SW Proxy] Proxy created successfully');
		
		// Set the proxy in the cell (handles resolution and re-bridging)
		swProxyCell.set(proxy);
		
	} catch (err) {
		console.error('[SW Proxy] Initialization failed:', err);
	}
}

// Start initialization immediately
if (typeof window !== 'undefined') {
	init();
}

/**
 * Gets the singleton proxy to the Service Worker's SSE Manager.
 */
export const getSWProxy = (): Promise<Comlink.Remote<SSEManager>> => swProxyCell.get();
