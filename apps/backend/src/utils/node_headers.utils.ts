import type { NodeHttpRequest } from "@orpc/standard-server-node";

/** A Node request's headers as a fetch `Headers` (repeated headers joined with ", "). */
export const nodeRequestHeaders = (req: Pick<NodeHttpRequest, "headers">): Headers => {
	const headers = new Headers();
	for (const [name, value] of Object.entries(req.headers)) {
		if (typeof value === "string") headers.set(name, value);
		else if (Array.isArray(value)) headers.set(name, value.join(", "));
	}
	return headers;
};
