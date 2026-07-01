import type { IncomingMessage, ServerResponse } from "node:http";
import { auth } from '@backend/modules/auth/auth.config';
import { handleBetterAuthCors } from "@backend/utils/cors.utils";
import type { NodeHttpRequest, NodeHttpResponse } from '@orpc/standard-server-node';
import { toNodeHandler } from 'better-auth/node';

export const betterAuthHandler = {
  handle: async (
    req: NodeHttpRequest,
    res: NodeHttpResponse
  ) => {
    // 1. Handle CORS and Preflight
    const handled = handleBetterAuthCors(req, res);
    if (handled) {
      return;
    }

    // Create better-auth Node.js handler
    const authHandler = toNodeHandler(auth);

    // 2. IP Detection
    const headersForIp = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headersForIp.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
    }

    // 3. Dispatch to Better Auth
    try {
      return await authHandler(req as IncomingMessage, res as ServerResponse);
    } catch (err) {
      console.error("[better-auth] Handler Error:", err);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end(JSON.stringify({ 
          error: "Internal Auth Error", 
          message: err instanceof Error ? err.message : String(err) 
        }));
      }
    }
  }
}