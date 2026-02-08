import { env } from "@frontend/configs/env.config";
import { createORPCClient, onError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { SimpleCsrfProtectionLinkPlugin } from '@orpc/client/plugins';
import type { UserAppRouter, UserAppRouterInputs, UserAppRouterOutputs } from "../../../backend/src/routers/user_app/user_app.router";

interface ClientContext {
  something?: string
}

const link = new RPCLink<ClientContext>({
  url: `${env.VITE_API_URL}/user-app`,
  headers: ({ context }) => (
    { 
        Authorization: 'Bearer token',
        'x-api-key': context.something
    }
  ),
  fetch: (request, init, _options, _path, _input) => {
    return globalThis.fetch(request, {
      ...init,
      credentials: 'include', // Include cookies for cross-origin requests
    })
  },
  interceptors: [
    onError(async (error) => {
      // Extract error info
      const err = error as { message?: string; status?: number; code?: string; path?: string; name?: string };
      const errorMessage = err.message || "An unexpected error occurred";
      
      if (err.name === "AbortError" || errorMessage.includes("signal is aborted")) {
        return;
      };
      
      // Check if this is an authentication error (401)
      const isAuthError = 
        err.status === 401 ||
        errorMessage.toLowerCase().includes("unauthenticated") ||
        errorMessage.toLowerCase().includes("authentication required");
      
      // Record error with session logging
      console.error("[oRPC Error]", err);
      
      // Only show toast and handle signout if in a browser context
      if (typeof window !== 'undefined') {
        const { toast } = await import("react-toastify");
        toast.error(errorMessage);
        
        // For auth errors, redirect to login ONLY if we're on a protected route
        if (isAuthError) {
          toast.error("Your session has expired. Please log in again.", { autoClose: 3000 });
          const { signout } = await import("./signout.utils");
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

/**
 * @public
 */
export type UserAppBackendInputs = UserAppRouterInputs;
/**
 * @public
 */
export type UserAppBackendOutputs = UserAppRouterOutputs;
