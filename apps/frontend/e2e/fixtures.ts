import { test as base } from '@playwright/test';
import { dismissPwaToast, setupPwaDismissal } from './playwright.utils';

/**
 * Custom Playwright test fixture that automatically runs dismissPwaToast before each test.
 * This effectively acts as a global beforeEach hook.
 */
export const test = base.extend<{
  autoDismissPwa: undefined;
}>({
  autoDismissPwa: [
    async ({ context, page }, use) => {
      // 1. Setup global dismissal for all future pages in this context
      await setupPwaDismissal(context);

      // 2. Immediate dismissal for the current page (fallback for slow loads)
      await dismissPwaToast(page);
      
      // 3. Setup a listener for any subsequent navigations within the same test
      page.on('load', async () => {
        await dismissPwaToast(page).catch(() => {});
      });

      await use();
    },
    { auto: true }, // This makes the fixture run automatically for every test
  ],
});

export { expect } from '@playwright/test';
