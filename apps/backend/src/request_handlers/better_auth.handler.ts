import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import { auth } from '@backend/modules/auth/auth.config';
import { getClientIpAddress } from '@backend/utils/client-info.utils';
import { toNodeHandler } from 'better-auth/node';
import type { NodeHttpRequest, NodeHttpResponse } from '@orpc/standard-server-node';
import { IncomingMessage, ServerResponse } from "node:http";
import { handleBetterAuthCors } from "@backend/utils/cors.utils";

export const betterAuthHandler = {
  handle: async (
    req: NodeHttpRequest,
    res: NodeHttpResponse
  ) => {
    // 1. Handle CORS and Preflight
    const handled = handleBetterAuthCors(req, res);
    console.log(`[better-auth] CORS handled: ${handled} for ${req.method} ${req.url}`);
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

    
    // Get client IP address for logging and potential rate limiting
      const clientIp = getClientIpAddress(headersForIp);
    console.log(`[better-auth] ${req.method} ${req.url} - IP: ${clientIp}`);

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