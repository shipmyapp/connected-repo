import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

type Handler = {
	handle: (
		req: IncomingMessage,
		res: ServerResponse,
		options: { prefix: `/${string}`; context: object },
	) => Promise<{ matched: boolean }>;
};

// Both handlers decide on CSRF when their module loads: load fresh copies
// with the deployed environment switched on, and serve one the way
// main.handler.ts does.
const loadDeployed = async (deployed: "production" | "staging") => {
	vi.resetModules();
	vi.doMock("@backend/configs/env.config", async (importOriginal) => ({
		...(await importOriginal<typeof import("@backend/configs/env.config")>()),
		isProd: deployed === "production",
		isStaging: deployed === "staging",
	}));
	const { superAdminHandler } = await import("./super_admin.handler.js");
	const { superAdminRpcHandler, SUPER_ADMIN_RPC_PREFIX } = await import(
		"./super_admin_rpc.handler.js"
	);
	return { superAdminHandler, superAdminRpcHandler, SUPER_ADMIN_RPC_PREFIX };
};

const serve = async (handler: Handler, prefix: `/${string}`) => {
	const server = createServer((req, res) => {
		void handler.handle(req, res, { prefix, context: {} }).then((r) => {
			if (!r.matched) {
				res.statusCode = 404;
				res.end();
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	return {
		base: `http://127.0.0.1:${port}${prefix}`,
		close: async () => {
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		},
	};
};

describe.each(["production", "staging"] as const)("super-admin surfaces in %s", (deployed) => {
	afterEach(() => {
		vi.doUnmock("@backend/configs/env.config");
		vi.resetModules();
	});

	it("OpenAPI: refuses a form post without the CSRF header, before any session check", async () => {
		const { superAdminHandler } = await loadDeployed(deployed);
		const { base, close } = await serve(superAdminHandler, "/super-admin");
		try {
			const form = await fetch(`${base}/setFlag`, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: "key=example.flag&scope=global&enabled=true",
			});
			expect(form.status).toBe(403);

			const withHeader = await fetch(`${base}/setFlag`, {
				method: "POST",
				headers: { "content-type": "application/json", "x-csrf-token": "orpc" },
				body: JSON.stringify({
					key: "example.flag",
					scope: "global",
					scopeId: null,
					enabled: true,
				}),
			});
			// Past the CSRF check, the gate wants a session.
			expect(withHeader.status).toBe(401);
		} finally {
			await close();
		}
	});

	it("RPC: refuses a call without the CSRF header, before any session check", async () => {
		const { superAdminRpcHandler, SUPER_ADMIN_RPC_PREFIX } = await loadDeployed(deployed);
		const { base, close } = await serve(superAdminRpcHandler, SUPER_ADMIN_RPC_PREFIX);
		try {
			const call = (headers: Record<string, string>) =>
				fetch(`${base}/ping`, {
					method: "POST",
					headers: { "content-type": "application/json", ...headers },
					body: JSON.stringify({}),
				});
			expect((await call({})).status).toBe(403);
			expect((await call({ "x-csrf-token": "orpc" })).status).toBe(401);
		} finally {
			await close();
		}
	});
});
