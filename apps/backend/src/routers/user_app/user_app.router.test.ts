import { userAppRouter } from '@backend/routers/user_app/user_app.router';
import { defaultContext } from '@backend/test/setup';
import { createRouterClient, type RouterClient } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

describe('User App Router', () => {
	let defaultClient: RouterClient<typeof userAppRouter>;
	const unauthClient = createRouterClient(userAppRouter);

	beforeEach(() => {
		defaultClient = createRouterClient(userAppRouter, {
			context: defaultContext,
		});
	});

	describe('health', () => {
		it('should return health status', async () => {
			const result = await defaultClient.health();

			expect(result.status).toBe('ok');
			expect(result.phase).toBe(1);
			expect(result.message).toContain('Phase 1');
			expect(result.timestamp).toBeDefined();
		});

		it('should work without authentication', async () => {
			const result = await unauthClient.health();

			expect(result.status).toBe('ok');
		});
	});
});