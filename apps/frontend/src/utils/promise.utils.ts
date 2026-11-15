/**
 * Limits the number of concurrent asynchronous operations.
 *
 * @param concurrency The maximum number of concurrent operations.
 * @returns A limiter function that wraps an async function.
 */
export function pLimit(concurrency: number) {
	if (!((Number.isInteger(concurrency) || concurrency === Infinity) && concurrency > 0)) {
		throw new TypeError("Expected `concurrency` to be a number from 1 and up");
	}

	const queue: Array<() => void> = [];
	let activeCount = 0;

	const next = () => {
		activeCount--;

		const nextItem = queue.shift();
		if (nextItem) nextItem();
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

/** Splits a list into consecutive slices of at most `size` items. */
export const chunk = <T>(items: readonly T[], size: number): T[][] => {
	const slices: T[][] = [];
	for (let start = 0; start < items.length; start += size) {
		slices.push(items.slice(start, start + size));
	}
	return slices;
};
