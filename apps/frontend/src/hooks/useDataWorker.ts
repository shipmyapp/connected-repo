import { env } from '@frontend/configs/env.config';
import { dataWorkerClient } from '@frontend/worker/worker.client';
import { useEffect, useState } from 'react';

/**
 * Initializes the data Worker once and returns readiness state.
 * Should be called near the root of the component tree (e.g. App.tsx).
 */
export function useDataWorker() {
  const [isReady, setIsReady] = useState(dataWorkerClient.isInitialized);

  useEffect(() => {
    if (dataWorkerClient.isInitialized) {
      setIsReady(true);
      return;
    }

    let cancelled = false;

    dataWorkerClient
      .initialize(env.VITE_API_URL)
      .then(() => {
        if (!cancelled) setIsReady(true);
      })
      .catch((err) => {
        console.error('[useDataWorker] Failed to initialize worker:', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { isReady };
}
