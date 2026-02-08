/**
 * Exponential backoff with jitter.
 *
 * @param attempt  Zero-based retry attempt number
 * @param baseDelay  Base delay in ms (default 1000)
 * @param maxDelay  Maximum delay cap in ms (default 30000)
 * @returns Delay in ms before the next retry
 */
export function calculateBackoff(
  attempt: number,
  baseDelay = 1_000,
  maxDelay = 30_000,
): number {
  const exponential = baseDelay * 2 ** attempt;
  const capped = Math.min(exponential, maxDelay);
  // Add jitter: random value between 0 and capped delay
  const jitter = Math.random() * capped;
  return Math.floor((capped + jitter) / 2);
}
