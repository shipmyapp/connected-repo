import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

type Handler = {
	handle: (
		req: IncomingMessage,
		res: ServerResponse,
		options: { prefix: `/${string}`; context: object },
	) => Promise<{ matched: boolean }>;
};

const getStatus = async (handler: Handler, prefix: `/${string}`, path: string) => {
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
	try {
		return (await fetch(`http://127.0.0.1:${port}${prefix}${path}`)).status;
	} finally {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	}
};

describe("API reference pages", () => {
	it("are served outside production", async () => {
		const { openApiHandler } = await import("./open_api.handler.js");
		expect(await getStatus(openApiHandler, "/api", "/spec.json")).toBe(200);
	});

	it("are not served in production", async () => {
		vi.resetModules();
		vi.doMock("@backend/configs/env.config", async (importOriginal) => ({
			...(await importOriginal<typeof import("@backend/configs/env.config")>()),
			isProd: true,
		}));
		const { openApiHandler } = await import("./open_api.handler.js");
		const { superAdminHandler } = await import("./super_admin.handler.js");
		const { mobileAppHandler } = await import("./mobile_app.handler.js");
		expect(await getStatus(openApiHandler, "/api", "/spec.json")).toBe(404);
		expect(await getStatus(superAdminHandler, "/super-admin", "/spec.json")).toBe(404);
		expect(await getStatus(mobileAppHandler, "/mobile-app", "/spec.json")).toBe(404);
		vi.doUnmock("@backend/configs/env.config");
		vi.resetModules();
	});
});
