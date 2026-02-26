/**
 * A ProxyCell handles the initialization and "stale-proof" updating
 * of a remote Comlink proxy.
 * 
 * It provides a promise that is:
 * 1. Pending until the first value is set.
 * 2. Resolved immediately once a value is available.
 * 3. Self-updating: if 'set' is called again, any current waiters are unblocked
 *    and the internal promise is replaced for future callers.
 */
export class ProxyCell<T> {
  private resolve!: (value: T) => void;
  private promise: Promise<T>;
  public isInitial = true;

  constructor() {
    this.promise = new Promise<T>((res) => {
      this.resolve = res;
    });
  }

  /**
   * Gets the current proxy promise.
   */
  get(): Promise<T> {
    return this.promise;
  }

  /**
   * Sets (or updates) the proxy value.
   * If this is an update, it replaces the internal promise to ensure
   * future callers get the fresh reference.
   */
  set(value: T) {
    if (this.isInitial) {
      this.resolve(value);
      this.isInitial = false;
      // Also replace with a resolved promise for performance/clarity
      this.promise = Promise.resolve(value);
    } else {
      // Re-initialize for future callers (stale-proof)
      this.promise = Promise.resolve(value);
    }
  }

  /**
   * Resets the cell to a pending state. 
   * Useful when a worker is terminated and we want future callers
   * to wait for a new initialization.
   */
  reset() {
    this.isInitial = true;
    this.promise = new Promise<T>((res) => {
      this.resolve = res;
    });
  }
}
