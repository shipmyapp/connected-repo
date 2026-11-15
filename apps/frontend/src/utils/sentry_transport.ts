/**
 * The pieces of Sentry's fetch transport this wrapper uses, typed loosely
 * enough that a test can pass a fake and the app can pass
 * `Sentry.makeFetchTransport` (kept out of the initial bundle).
 */
type Transport<E, R> = {
	send: (envelope: E) => PromiseLike<R>;
	flush: (timeout?: number) => PromiseLike<boolean>;
};

type Envelope = [{ dsn?: string }, ...unknown[]];

/**
 * Sends straight to Sentry; when a send fails at the network level while the
 * browser is online (an ad-blocker or privacy setting dropping
 * *.ingest.sentry.io), that envelope and every later one on this page go
 * through the same-origin tunnel instead. No probe runs first, so a browser
 * that can reach Sentry never touches the tunnel and its console stays quiet.
 * The tunnel's URL carries no key, so its envelopes carry the DSN in their
 * header, as Sentry's own `tunnel` option does.
 */
export function fallbackToTunnel<O extends { url: string }, E extends Envelope, R>(
	makeTransport: (options: O) => Transport<E, R>,
	config: { tunnelUrl: string; dsn: string | undefined; isEnabled: boolean },
) {
	return (options: O) => {
		const direct = makeTransport(options);
		if (!config.isEnabled) return direct;
		const tunnel = makeTransport({ ...options, url: config.tunnelUrl });
		let isBlocked = false;

		const viaTunnel = (envelope: E): PromiseLike<R> => {
			if (config.dsn) envelope[0].dsn = config.dsn;
			return tunnel.send(envelope);
		};

		return {
			send: async (envelope: E): Promise<R> => {
				if (isBlocked) return viaTunnel(envelope);
				try {
					return await direct.send(envelope);
				} catch (error) {
					// Offline: the tunnel would fail too, and the next send tries direct again.
					if (globalThis.navigator?.onLine === false) throw error;
					isBlocked = true;
					return viaTunnel(envelope);
				}
			},
			flush: async (timeout?: number) => {
				const [isDirectFlushed, isTunnelFlushed] = await Promise.all([
					direct.flush(timeout),
					tunnel.flush(timeout),
				]);
				return isDirectFlushed && isTunnelFlushed;
			},
		};
	};
}
