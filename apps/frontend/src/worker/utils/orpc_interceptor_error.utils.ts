/**
 * Detects if a thrown error or response is an authentication failure.
 * 
 * This centralizes the check for 401 status codes and specific oRPC error codes
 * or messages, ensuring consistency between the SyncManager and oRPC client.
 */
export function isAuthError(err: unknown): boolean {
  if (!err) return false;

  const error = err as { 
    status?: number; 
    code?: string; 
    message?: string;
    originalError?: { status?: number };
  };

  // 1. Check for standard HTTP 401 status
  if (error.status === 401 || error.originalError?.status === 401) {
    return true;
  }

  // 2. Check for oRPC specific error code
  if (error.code === 'UNAUTHORIZED') {
    return true;
  }

  // 3. Fallback to message matching (case-insensitive)
  const message = error.message?.toLowerCase() || '';
  return (
    message.includes('unauthenticated') ||
    message.includes('authentication required') ||
    message.includes('user is not authenticated')
  );
}
