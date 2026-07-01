import type { BrowserContext, Page } from '@playwright/test';

/**
 * Dismisses the PWA installation snackbar/toast if it appears.
 * This is crucial for mobile tests where the toast might obstruct buttons like "Save Entry".
 */
export async function dismissPwaToast(page: Page) {
  // 1. Silent dismissal via localStorage to prevent it from ever showing
  await page.evaluate(() => {
    localStorage.setItem('pwa_install_dismissed', Date.now().toString());
  }).catch(() => {});

  // 2. UI dismissal as fallback if it already showed up
  const laterButton = page.locator('button:has-text("Later"), button:has-text("Close")');
  try {
    if (await laterButton.isVisible({ timeout: 500 })) {
       await laterButton.click({ timeout: 500 }).catch(() => {
         return laterButton.click({ force: true }).catch(() => {});
       });
    }
  } catch {}
}

/**
 * Sets up PWA dismissal at the context level using addInitScript.
 * This ensures localStorage is set BEFORE any page loads.
 */
export async function setupPwaDismissal(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.setItem('pwa_install_dismissed', Date.now().toString());
  });
}
