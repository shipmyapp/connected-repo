import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackToTunnel } from "./sentry_transport";

type Envelope = [{ dsn?: string }, unknown[]];

const DSN = "https://key@o1.ingest.sentry.io/2";
const DIRECT = "https://o1.ingest.sentry.io/api/2/envelope/?sentry_key=key";

/** A fake fetch transport: sends to `url` fail when it is in `blocked`. */
const fakeTransports = (blocked: string[]) => {
	const sent: { url: string; dsn?: string }[] = [];
	const make = (options: { url: string }) => ({
		send: async (envelope: Envelope) => {
			if (blocked.includes(options.url)) throw new TypeError("Failed to fetch");
			sent.push({ url: options.url, dsn: envelope[0].dsn });
			return {};
		},
		flush: async () => true,
	});
	return { make, sent };
};

const envelope = (): Envelope => [{}, []];

describe("fallbackToTunnel", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("sends directly when Sentry is reachable, and never to the tunnel", async () => {
		const { make, sent } = fakeTransports([]);
		const transport = fallbackToTunnel(make, {
			tunnelUrl: "/api/sentry-tunnel",
			dsn: DSN,
			isEnabled: true,
		})({ url: DIRECT });
		await transport.send(envelope());
		await transport.send(envelope());
		expect(sent).toEqual([{ url: DIRECT }, { url: DIRECT }]);
	});

	it("switches to the tunnel, with the DSN in the header, once direct is blocked", async () => {
		const { make, sent } = fakeTransports([DIRECT]);
		const transport = fallbackToTunnel(make, {
			tunnelUrl: "/api/sentry-tunnel",
			dsn: DSN,
			isEnabled: true,
		})({ url: DIRECT });
		await transport.send(envelope());
		await transport.send(envelope());
		expect(sent).toEqual([
			{ url: "/api/sentry-tunnel", dsn: DSN },
			{ url: "/api/sentry-tunnel", dsn: DSN },
		]);
	});

	it("does not switch while offline", async () => {
		vi.stubGlobal("navigator", { onLine: false });
		const { make, sent } = fakeTransports([DIRECT]);
		const transport = fallbackToTunnel(make, {
			tunnelUrl: "/api/sentry-tunnel",
			dsn: DSN,
			isEnabled: true,
		})({ url: DIRECT });
		await expect(transport.send(envelope())).rejects.toThrow("Failed to fetch");
		expect(sent).toEqual([]);
	});

	it("is the plain direct transport when disabled (development)", async () => {
		const { make, sent } = fakeTransports([DIRECT]);
		const transport = fallbackToTunnel(make, {
			tunnelUrl: "/api/sentry-tunnel",
			dsn: DSN,
			isEnabled: false,
		})({ url: DIRECT });
		await expect(transport.send(envelope())).rejects.toThrow();
		expect(sent).toEqual([]);
	});
});
