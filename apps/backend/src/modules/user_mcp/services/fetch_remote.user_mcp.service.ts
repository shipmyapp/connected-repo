import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import {
	guardedLookup,
	isBlockedAddress,
	SsrfBlockedError,
} from "@backend/modules/webhook_calls/handlers/ssrf_guard.utils";

/**
 * Fetches one remote document (a connected app's Client ID Metadata
 * Document, ADR-045) without letting the URL reach anything inside our
 * network (ADR-012's SSRF guard, the same block list as webhooks):
 *
 * - http and https only, on ports 80 and 443;
 * - every address the name resolves to is checked when the socket connects
 *   (so a DNS answer that changes between check and use cannot slip
 *   through), and private, loopback, link-local, metadata and other
 *   special ranges are refused, IPv4 and IPv6;
 * - at most three redirects, each checked again;
 * - a size cap enforced while reading, and a time limit for the whole fetch.
 */
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;
const USER_AGENT = "OneQ/1.0 (connected app metadata fetch)";

export class FetchRefusal extends Error {}

const PRIVATE_NETWORK = "That link points inside a private network.";

/** An IP literal in a URL's host (IPv6 without its brackets), or null for a name. */
const literalAddress = (hostname: string): { address: string; family: number } | null => {
	const address = hostname.replace(/^\[|\]$/g, "");
	const family = isIP(address);
	return family ? { address, family } : null;
};

interface Fetched {
	bytes: Buffer;
	fileName: string;
	finalUrl: string;
}

const fileNameOf = (url: URL, disposition: string | undefined): string => {
	const fromHeader = disposition
		? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1]
		: undefined;
	const fromPath = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
	return (fromHeader ? decodeURIComponent(fromHeader) : fromPath).slice(0, 200) || "file";
};

const tooLarge = (maxBytes: number) =>
	new FetchRefusal(`That file is larger than ${Math.max(1, Math.round(maxBytes / 1024))} KB.`);

const fetchOnce = (
	url: URL,
	maxBytes: number,
	allowPrivate: boolean,
	signal: AbortSignal,
	accept: string,
) =>
	new Promise<{
		status: number;
		location?: string;
		bytes?: Buffer;
		disposition?: string;
	}>((resolve, reject) => {
		const client = url.protocol === "https:" ? https : http;
		const request = client.get(
			url,
			{
				// The tests' local server only: everything in the app goes through the guard.
				...(allowPrivate ? {} : { lookup: guardedLookup }),
				headers: { "user-agent": USER_AGENT, accept },
				signal,
			},
			(response) => {
				const status = response.statusCode ?? 0;
				if (status >= 300 && status < 400 && response.headers.location) {
					response.resume();
					return resolve({ status, location: response.headers.location });
				}
				if (status !== 200) {
					response.resume();
					return resolve({ status });
				}
				const declared = Number(response.headers["content-length"] ?? 0);
				if (declared > maxBytes) {
					response.destroy();
					return reject(tooLarge(maxBytes));
				}
				const chunks: Buffer[] = [];
				let size = 0;
				response.on("data", (chunk: Buffer) => {
					size += chunk.byteLength;
					if (size > maxBytes) {
						response.destroy();
						reject(tooLarge(maxBytes));
						return;
					}
					chunks.push(chunk);
				});
				response.on("end", () =>
					resolve({
						status,
						bytes: Buffer.concat(chunks),
						disposition: response.headers["content-disposition"],
					}),
				);
				response.on("error", reject);
			},
		);
		request.on("error", reject);
	});

/**
 * Downloads one remote document. `allowPrivate` exists for the tests' local
 * server only; nothing in the app sets it outside tests.
 */
export async function fetchRemoteFile(
	raw: string,
	maxBytes: number,
	options: { allowPrivate?: boolean; accept?: string; timeoutMs?: number } = {},
): Promise<Fetched> {
	const allowPrivate = options.allowPrivate === true;
	const accept = options.accept ?? "application/json";
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new FetchRefusal("That is not a link.");
	}
	const signal = AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS);
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (url.protocol !== "https:" && url.protocol !== "http:")
			throw new FetchRefusal("Only http and https links can be fetched.");
		if (url.port && url.port !== "80" && url.port !== "443" && !allowPrivate) {
			throw new FetchRefusal("Only links on the standard ports can be fetched.");
		}
		if (url.username || url.password)
			throw new FetchRefusal("Links with a password in them are not fetched.");
		const literal = literalAddress(url.hostname);
		if (literal && !allowPrivate && isBlockedAddress(literal.address, literal.family)) {
			throw new FetchRefusal(PRIVATE_NETWORK);
		}
		let result: Awaited<ReturnType<typeof fetchOnce>>;
		try {
			result = await fetchOnce(url, maxBytes, allowPrivate, signal, accept);
		} catch (error) {
			if (error instanceof FetchRefusal) throw error;
			if (error instanceof SsrfBlockedError) throw new FetchRefusal(PRIVATE_NETWORK);
			if (signal.aborted) throw new FetchRefusal("The link took too long to answer.");
			throw new FetchRefusal("The link could not be reached.");
		}
		if (result.location) {
			url = new URL(result.location, url);
			continue;
		}
		if (!result.bytes) {
			throw new FetchRefusal(
				result.status === 401 || result.status === 403
					? "That link is private."
					: `The link answered ${result.status}.`,
			);
		}
		return {
			bytes: result.bytes,
			fileName: fileNameOf(url, result.disposition),
			finalUrl: url.toString(),
		};
	}
	throw new FetchRefusal("The link redirects too many times.");
}
