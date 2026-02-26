/**
 * Limits the number of concurrent asynchronous operations.
 * 
 * @param concurrency The maximum number of concurrent operations.
 * @returns A limiter function that wraps an async function.
 */
export function pLimit(concurrency: number) {
  if (!((Number.isInteger(concurrency) || concurrency === Infinity) && concurrency > 0)) {
    throw new TypeError('Expected `concurrency` to be a number from 1 and up');
  }

  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;

    if (queue.length > 0) {
      queue.shift()!();
    }
  };

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    activeCount++;

    try {
      const result = await fn();
      return result;
    } finally {
      next();
    }
  };

  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const wrappedFn = () => run(fn).then(resolve).catch(reject);

      if (activeCount < concurrency) {
        wrappedFn();
      } else {
        queue.push(wrappedFn);
      }
    });
  };

  return enqueue;
}
