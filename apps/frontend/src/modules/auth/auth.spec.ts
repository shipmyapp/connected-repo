import { expect, test } from '@playwright/test';

test.describe('Authentication', () => {
  test('redirects unauthenticated users to login from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/auth/login');
    await expect(page.locator('h3')).toContainText('Welcome');
  });

  test('login page loads with Google sign-in button', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('h3')).toContainText('Welcome');
    await expect(page.locator('text=Continue with Google')).toBeVisible();
    await expect(page.locator('text=Continue with Google')).toBeEnabled();
  });

  test('login page shows error message for OAuth failure', async ({ page }) => {
    await page.goto('/auth/login?error=oauth_failed');
    await expect(page.locator('text=Authentication failed. Please try again.')).toBeVisible();
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    // Start at login page
    await page.goto('/auth/login');

    // Click the login button (shows "Continue with Google" but uses password login in test mode)
    await page.locator('text=Continue with Google').click();

    // Wait for redirect
    await page.waitForURL(/\/(dashboard|journal-entries\/new)/);

    // Verify user is authenticated by checking for user menu
    await expect(page.locator('[aria-label*="User menu"]')).toBeVisible();
  });
});