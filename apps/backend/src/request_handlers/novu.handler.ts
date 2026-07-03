import { env, isDev } from "@backend/configs/env.config";
import { novuWorkflows } from "@backend/novu/workflows";
import { logger } from "@backend/utils/logger.utils";
import { Client, NovuRequestHandler } from "@novu/framework";
import type {
	NodeHttpRequest,
	NodeHttpResponse,
} from "@orpc/standard-server-node";

// Novu bridge payloads are workflow definitions + previews, small by design.
// 1 MiB is generous but bounds an adversarial stream that could otherwise
// buffer unbounded memory before JSON.parse rejects it.
const MAX_BODY_BYTES = 1_048_576;

class BodyTooLargeError extends Error {
	constructor() {
		super("Novu bridge body exceeds 1 MiB cap");
		this.name = "BodyTooLargeError";
	}
}

const readBody = async (req: NodeHttpRequest): Promise<unknown> => {
	const chunks: Buffer[] = [];
	let total = 0;
	for await (const chunk of req) {
		const buf = chunk as Buffer;
		total += buf.length;
		if (total > MAX_BODY_BYTES) throw new BodyTooLargeError();
		chunks.push(buf);
	}
	if (chunks.length === 0) return undefined;
	const raw = Buffer.concat(chunks).toString("utf-8");
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
};

/**
 * Bridge endpoint for the Novu CLI (`npx novu@latest sync --bridge-url ...`)
 * to discover and preview code-defined workflows in apps/backend/src/novu/.
 *
 * Framework ships adapters for Express/Next/Nest/etc. — none for raw Node
 * HTTP — so we build the adapter inline against NovuRequestHandler's
 * documented handler shape.
 *
 * Not required at runtime for workflow execution: once `novu sync` publishes
 * the workflows, Novu calls back to this bridge only when previewing steps
 * from the dashboard. Safe to disable in prod behind an env gate if you
 * only sync from a build/CI environment.
 *
 * When `NOVU_SECRET_KEY` is unset (CI, dev without Novu, e2e boot) we
 * build a stub handler that returns 503 rather than constructing the
 * real `Client` — the `@novu/framework` Client constructor throws
 * `MissingSecretKeyError` at instantiation, which crashes the process
 * at module load. This gate makes the backend boot without Novu.
 */
// Real Client instance — must have live method bindings (addWorkflows,
// addAgents, executeWorkflow, etc.). Passing a plain object here would fail
// at first request with "this.client.addAgents is not a function".
const nodeHandler: ((req: NodeHttpRequest, res: NodeHttpResponse) => Promise<void>) | null =
	env.NOVU_SECRET_KEY
		? (() => {
				const novuClient = new Client({
					secretKey: env.NOVU_SECRET_KEY,
					apiUrl: env.NOVU_API_URL,
					// Strict HMAC auth in prod/staging/test; only loosened in dev so the
					// initial `novu sync` handshake doesn't 401 before the Secret Key
					// round-trip is set up. Anyone who can reach /api/novu with strict OFF
					// can enumerate workflows and preview steps.
					strictAuthentication: !isDev,
				});

				const requestHandler = new NovuRequestHandler({
					frameworkName: "node-http",
					workflows: novuWorkflows,
					client: novuClient,
					handler: (req: NodeHttpRequest, res: NodeHttpResponse) => {
						let bodyPromise: Promise<unknown> | null = null;
						return {
							body: () => {
								if (!bodyPromise) bodyPromise = readBody(req);
								return bodyPromise;
							},
							headers: (key: string) => {
								const v = req.headers[key.toLowerCase()];
								return Array.isArray(v) ? v[0] : v;
							},
							method: () => req.method || "GET",
							url: () => {
								const host = req.headers.host || "localhost";
								const protocol = req.headers["x-forwarded-proto"] || "http";
								return new URL(req.url || "/", `${protocol}://${host}`);
							},
							queryString: (key: string, url: URL) => url.searchParams.get(key),
							transformResponse: ({ body, headers, status }) => {
								for (const [k, v] of Object.entries(headers)) {
									res.setHeader(k, v);
								}
								res.statusCode = status;
								res.end(body);
							},
						};
					},
				});

				return requestHandler.createHandler();
			})()
		: null;

export const novuHandler = {
	handle: async (req: NodeHttpRequest, res: NodeHttpResponse) => {
		if (!nodeHandler) {
			if (!res.writableEnded) {
				res.statusCode = 503;
				res.end(
					JSON.stringify({
						error: "Novu bridge disabled",
						message: "NOVU_SECRET_KEY is not configured on this deployment",
					}),
				);
			}
			return;
		}
		try {
			await nodeHandler(req, res);
		} catch (err) {
			if (err instanceof BodyTooLargeError) {
				logger.warn(
					{ url: req.url },
					"Novu bridge rejected oversized body",
				);
				if (!res.writableEnded) {
					res.statusCode = 413;
					res.end(JSON.stringify({ error: "Payload too large" }));
				}
				return;
			}
			logger.error({ err, url: req.url }, "Novu bridge handler failed");
			if (!res.writableEnded) {
				res.statusCode = 500;
				res.end(
					JSON.stringify({
						error: "Novu bridge error",
						message: err instanceof Error ? err.message : String(err),
					}),
				);
			}
		}
	},
};
