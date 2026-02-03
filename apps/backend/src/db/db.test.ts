import { db } from '@backend/db/db';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('Basic Database Test', () => {
	it('should be able to query the database', async () => {
		// This is a basic test to ensure database connection works
		const count = await db.users.count();
		expect(typeof count).toBe('number');
		expect(count).toBeGreaterThanOrEqual(0);
	});

	it('should have isolated transactions between tests', async () => {
		// Get initial count
		const initialCount = await db.users.count();
		const uniqueId = randomUUID();

		// Create a test user (this will be rolled back after the test)
		await db.users.create({
			email: `test-${uniqueId}@example.com`,
			name: 'Test User',
			themeSetting: 'system',
		});

		// Verify the user was created in this transaction
		const afterCreateCount = await db.users.count();
		expect(afterCreateCount).toBe(initialCount + 1);

		// Find the created user
		const user = await db.users.findBy({ email: `test-${uniqueId}@example.com` });
		expect(user).toBeTruthy();
		expect(user?.name).toBe('Test User');
	});
});