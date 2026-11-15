import type {
	SuperAdminRouter,
	SuperAdminRouterOutputs,
} from "@backend/routers/super_admin/super_admin.router";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { apiOrigin } from "@superadmin/configs/env.config";

// The super-admin router and nothing else of the backend's: the console never
// imports the user app's router.
const link = new RPCLink({
	url: `${apiOrigin}/api/super-admin`,
	fetch: (request, init) => globalThis.fetch(request, { ...init, credentials: "include" }),
	interceptors: [
		onError((error) => {
			if (error instanceof Error && error.name === "AbortError") return;
			console.error("[superadmin oRPC]", error instanceof Error ? error.message : error);
		}),
	],
	plugins: [new SimpleCsrfProtectionLinkPlugin()],
});

export const orpcFetch: SuperAdminRouter = createORPCClient(link);
export const orpc = createTanstackQueryUtils(orpcFetch);

export type SuperAdminOutputs = SuperAdminRouterOutputs;
