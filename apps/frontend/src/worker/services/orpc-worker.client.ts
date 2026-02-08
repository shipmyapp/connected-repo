import { createORPCClient, onError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { SimpleCsrfProtectionLinkPlugin } from '@orpc/client/plugins';
import type { UserAppRouter } from "../../../../backend/src/routers/user_app/user_app.router";
import type { AuthExpiredEvent } from '../worker.types';
import { isAuthError } from '../utils/orpc_interceptor_error.utils';
/**
 * Creates an oRPC client configured for use inside a Web Worker.
 *
 * - Uses `credentials: 'include'` for cookie-based auth
 * - CSRF protection via SimpleCsrfProtectionLinkPlugin
 * - 401 errors broadcast an `auth-expired` push event (Worker can't redirect)
 */
export function createWorkerOrpcClient(
  apiUrl: string,
  broadcastAuthExpired: (event: AuthExpiredEvent) => void,
): UserAppRouter {
  const link = new RPCLink({
    url: `${apiUrl}/user-app`,
    fetch: (request, init) => {
      return globalThis.fetch(request, {
        ...init,
        credentials: 'include',
      });
    },
    interceptors: [
      onError(async (error) => {
        if (isAuthError(error)) {
          broadcastAuthExpired({
            type: 'push',
            event: 'auth-expired',
            payload: {},
          });
        }
      }),
    ],
    plugins: [new SimpleCsrfProtectionLinkPlugin()],
  });

  return createORPCClient(link);
}
