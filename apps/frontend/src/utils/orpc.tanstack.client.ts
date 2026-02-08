import { orpcFetch } from '@frontend/utils/orpc.client';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';

export const orpc = createTanstackQueryUtils(orpcFetch);