import { env } from "@frontend/configs/env.config";
import { createORPCClient, onError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { SimpleCsrfProtectionLinkPlugin } from '@orpc/client/plugins';
import { toast } from 'react-toastify';
import type { UserAppRouter, UserAppRouterInputs, UserAppRouterOutputs } from "../../../backend/src/routers/user_app/user_app.router";
import { getActiveTeamIdReady } from "./active_team_header.client";
import { signout } from './signout.utils';
import { switchGate } from './switch_gate';

interface ClientContext {
  something?: string
}

// When VITE_API_URL is empty (Dokploy same-origin reverse-proxy deploy), we
// must resolve against the current origin ourselves. Passing a relative path
// like "/api/user-app" here works for `fetch`, but oRPC's RPCLink internally
// does `new URL(path, this.url)` which throws "Invalid URL" on a relative
// base — breaking every RPC call and making the sync worker retry-loop
// forever with "Failed to construct 'URL': Invalid URL".
// globalThis.location is defined in main thread, workers, and service workers.
const orpcBaseUrl = env.VITE_API_URL
  ? `${env.VITE_API_URL}/api/user-app`
  : `${globalThis.location.origin}/api/user-app`;

const link = new RPCLink<ClientContext>({
  url: orpcBaseUrl,
  // Async by design: awaits two barriers before every outbound request.
  //   1. `switchGate.waitOpen()` — blocks during a team switch so the
  //      header, worker cache, and backend session cannot disagree.
  //      Rejects after the gate's default timeout so a hung switch
  //      surfaces as a retriable error instead of piling up requests.
  //      The `teams.setActiveTeam` RPC itself is exempt — it is the
  //      operation that drives the switch, and gating it would deadlock
  //      the very code that is meant to reopen the gate.
  //   2. `getActiveTeamIdReady()` — first-seed signal for the header
  //      cache (authLoader on main, dataProxy.sync.setActiveTeamId on
  //      worker). After the first seed, this resolves near-instantly.
  headers: async ({ context }, path) => {
    const isSwitchRpc = path[0] === 'teams' && path[1] === 'setActiveTeam';
    if (!isSwitchRpc) {
      await switchGate.waitOpen();
    }
    const teamId = await getActiveTeamIdReady();
    const headers: Record<string, string> = {
      Authorization: 'Bearer token',
    };
    if (context.something) headers['x-api-key'] = context.something;
    if (teamId) headers['x-team-id'] = teamId;
    return headers;
  },
  fetch: async (request, init, _options, _path, _input) => {
    const fetchInit: RequestInit = {
      ...init,
      credentials: 'include' as const, // Include cookies for cross-origin requests
    };
    const response = await globalThis.fetch(request, fetchInit);

    // Transparent one-shot retry for the "in-flight during team switch"
    // race. The switch-gate blocks requests that HAVEN'T yet baked their
    // headers, but a request already dispatched over the network can land
    // on the server with a stale x-team-id after the backend session has
    // flipped — the server responds 403 "Active team id mismatch". Here
    // we wait for the gate to reopen (switch finishes), rebuild the
    // request with the fresh header, and retry once. A stamp header
    // prevents a retry loop; a non-team-mismatch 403 falls through.
    if (
      response.status === 403 &&
      !request.headers.get('x-team-switch-retried')
    ) {
      let bodyText = '';
      try {
        bodyText = await response.clone().text();
      } catch {
        // Response body may not be replayable in some browsers.
      }
      if (bodyText.includes('Active team id mismatch')) {
        try {
          await switchGate.waitOpen();
        } catch {
          return response; // gate stuck — surface the original 403
        }
        const teamId = await getActiveTeamIdReady();
        const retryHeaders = new Headers(request.headers);
        retryHeaders.set('x-team-switch-retried', '1');
        if (teamId) retryHeaders.set('x-team-id', teamId);
        else retryHeaders.delete('x-team-id');
        const method = request.method.toUpperCase();
        const body =
          method === 'GET' || method === 'HEAD'
            ? undefined
            : await request.clone().blob();
        const retryReq = new Request(request.url, {
          method,
          headers: retryHeaders,
          body,
        });
        return await globalThis.fetch(retryReq, fetchInit);
      }
    }

    return response;
  },
  interceptors: [
    onError(async (error) => {
      // Extract error info
      const err = error as { message?: string; status?: number; code?: string; path?: string; name?: string; cause?: { name?: string; message?: string } };
      const errorMessage = err.message || "An unexpected error occurred";

      // Abort detection has to cover three shapes:
      //   1. Raw AbortError from fetch → err.name === "AbortError"
      //   2. Message contains the abort phrasing directly (older SDK behaviour)
      //   3. oRPC wraps aborts as "Cannot parse response body..." with the real
      //      AbortError on err.cause — most common shape in prod. Without the
      //      cause check, every navigation-cancelled request logs as an error.
      const causeName = err.cause?.name;
      const causeMessage = err.cause?.message ?? "";
      const isAbort =
        err.name === "AbortError" ||
        causeName === "AbortError" ||
        errorMessage.includes("signal is aborted") ||
        errorMessage.includes("stream closed") ||
        errorMessage.includes("aborted a request") ||
        causeMessage.includes("aborted a request") ||
        causeMessage.includes("signal is aborted");
      if (isAbort) {
        console.debug("[oRPC] Request aborted or stream closed (expected during navigation/offline tests)");
        return;
      };
      
      // Check if this is an authentication error (401)
      const isAuthError = 
        err.status === 401 ||
        errorMessage.toLowerCase().includes("unauthenticated") ||
        errorMessage.toLowerCase().includes("authentication required");
      
      // Only log errors if we are NOT offline (to avoid console noise for expected failures)
      const isActuallyOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (!isActuallyOffline) {
          console.error("[oRPC Error]", err);
      } else {
          console.debug("[oRPC] Suppressed fetch error while offline:", errorMessage);
      }
      
      // Only show toast and handle signout if in a browser context
      if (typeof window !== 'undefined') {
        
        // For auth errors, redirect to login ONLY if we're on a protected route
        if (isAuthError) {
          toast.error("Your session has expired. Please log in again.", { autoClose: 3000 });
          await signout();
        }
      } else {
          // In a worker, we just log and potentially notify the main thread if needed
          console.warn(`[oRPC Worker] Auth error detected: ${errorMessage}`);
      }
    })
  ],
  plugins: [
     new SimpleCsrfProtectionLinkPlugin(),
  ]
})

export const orpcFetch: UserAppRouter = createORPCClient(link);

// Dev-only console helper. Lets you drive any oRPC endpoint from browser
// DevTools while iterating on features. Example:
//   await __orpc.notifications.testSendPush({ title: 'Hi', body: 'test' })
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __orpc: UserAppRouter }).__orpc = orpcFetch;
}

/**
 * @public
 */
export type UserAppBackendInputs = UserAppRouterInputs;
/**
 * @public
 */
export type UserAppBackendOutputs = UserAppRouterOutputs;
