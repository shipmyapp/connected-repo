import { isDev } from "@backend/configs/env.config";
import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import type { NodeHttpRequest, NodeHttpResponse } from '@orpc/standard-server-node';

/**
 * Handles CORS headers for all better-auth incoming requests.
 * 
 * @returns true if the request was an OPTIONS preflight and the response was sent.
 */
export function handleBetterAuthCors(req: NodeHttpRequest, res: NodeHttpResponse): boolean {
  const originHeader = req.headers.origin || req.headers[':origin'];
  console.log(`[CORS] Origin: ${originHeader}`);
  const currentOrigin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

  if (!currentOrigin) {
    return false;
  }

  // 1. Determine if the origin is allowed
  const isAllowed = allowedOrigins.includes(currentOrigin);

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', currentOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-csrf-token, sentry-trace, baggage, x-requested-with');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');

    // Log CORS approval
    console.log(`[CORS] APPROVED: ${currentOrigin} for ${req.method} ${req.url}`);
  } else {
    console.warn(`[CORS] BLOCKED: ${currentOrigin} for ${req.method} ${req.url}`);
    if (isDev) {
      console.log(`[CORS] allowedOrigins: ${JSON.stringify(allowedOrigins)}`);
    }
  }

  // 2. Handle Preflight (OPTIONS)
  if (req.method?.toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Content-Length', '0');
    res.end();
    return true;
  }

  return false;
}