// Test setup file for Vitest
// This file runs before each test suite
import { db } from '@backend/db/db';
import type { ActiveSessionSelectAll } from '@backend/modules/auth/tables/session.auth.table';
import { createUserAndLogin } from '@backend/test/utils/user-auth.utils';
import type { UserSelectAll } from '@connected-repo/zod-schemas/user.zod';
import { testTransaction } from 'orchid-orm';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

export let defaultContext: undefined | {
  reqHeaders: Headers;
  session: ActiveSessionSelectAll;
  user: UserSelectAll;
};

beforeAll(async () => {
  await testTransaction.start(db);
});

beforeEach(async () => {
  await testTransaction.start(db);
  const context = await createUserAndLogin();
  defaultContext = context;
});

afterEach(async () => {
  defaultContext = undefined;
  await testTransaction.rollback(db);
});

afterAll(async () => {
  await testTransaction.close(db);
});
