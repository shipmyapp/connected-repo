import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import { auth } from '@backend/modules/auth/auth.config';
import { getClientIpAddress } from '@backend/utils/client-info.utils';
import { toNodeHandler } from 'better-auth/node';
import type { IncomingMessage, ServerResponse } from "node:http";

export const betterAuthHandler = {
  handle: (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage> & { req: IncomingMessage;}
  ) => {
      // Create better-auth Node.js handler
      const authHandler = toNodeHandler(auth);
      
      // Handle CORS for auth routes with enhanced error handling
      const origin = req.headers.origin;
      const referer = req.headers.referer;

      // Convert Node.js headers to Headers object for IP detection
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
      }
      
      // Get client IP address for logging and potential rate limiting
      const clientIp = getClientIpAddress(headers);

      // Validate origin against allowedOrigins
      // When credentials are required, we must use the actual origin, not '*'
      let allowOrigin: string;
      if (origin && allowedOrigins.includes(origin)) {
        allowOrigin = origin;
      } else if (origin && allowedOrigins.length > 0 && allowedOrigins[0]) {
        // Origin present but doesn't match - this is an error in production
        allowOrigin = allowedOrigins[0];
        console.warn("[better-auth] Origin mismatch:", {
          clientIp,
          requestOrigin: origin,
          allowedOrigins,
          using: allowedOrigins[0],
        });
      } else if (!origin && allowedOrigins.length > 0 && allowedOrigins[0]) {
        // No Origin header - use first allowed origin
        // This can happen with some proxies or non-browser clients
        allowOrigin = allowedOrigins[0];
        console.warn("[better-auth] No Origin header present:", {
          clientIp,
          referer,
          allowedOrigins,
          using: allowedOrigins[0],
          url: req.url,
          method: req.method,
        });
      } else {
        // No allowed origins configured - allow the request origin or use '*'
        allowOrigin = origin || "*";
        console.warn("[better-auth] No ALLOWED_ORIGINS configured, using:", allowOrigin);
      }

      res.setHeader('Access-Control-Allow-Origin', allowOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-csrf-token, sentry-trace, baggage');
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      // Add Vary header to indicate that the response varies based on Origin
      res.setHeader('Vary', 'Origin');

      if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
      }

      return authHandler(req, res);

    }
}