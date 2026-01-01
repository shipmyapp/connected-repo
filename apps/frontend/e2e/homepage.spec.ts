import { expect, test } from '@playwright/test';

test('homepage loads and redirects appropriately', async ({ page }) => {
  await page.goto('/');
  // Wait for redirect to either login or dashboard
  await page.waitForURL((url) => url.pathname === '/auth/login' || url.pathname === '/dashboard');

  const currentURL = page.url();
  if (currentURL.includes('/auth/login')) {
    // Unauthenticated state: should redirect to login
    await expect(page.locator('h3')).toContainText('Welcome');
  } else if (currentURL.includes('/dashboard')) {
    // Authenticated state: should redirect to dashboard
    await expect(page.locator('h4').filter({ hasText: /Welcome back/i })).toBeVisible();
    await expect(page.locator('[aria-label*="User menu"]')).toBeVisible();
  }
});