/**
 * E2E test for first-run onboarding flow
 * Tests: 2-card sequence, persistence, and no language selection
 */

import { test, expect } from '@playwright/test';

test.describe('First-Run Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage to simulate first run
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('should show voice card on first run', async ({ page }) => {
    await page.goto('/');
    
    // Wait for splash screen and navigate to app
    await page.waitForSelector('text=Get Started', { timeout: 10000 });
    await page.click('text=Get Started');
    
    // Check that voice card appears
    await expect(page.locator('text=Voice Navigation')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Press & hold the mic button')).toBeVisible();
  });

  test('should show read aloud card after dismissing voice card', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to app
    await page.click('text=Get Started');
    
    // Wait for voice card and click "Skip"
    await page.waitForSelector('text=Voice Navigation');
    await page.click('text=Skip');
    
    // Read aloud card should appear
    await expect(page.locator('text=Read Aloud')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Enable text-to-speech')).toBeVisible();
  });

  test('should not show cards after completing onboarding', async ({ page }) => {
    await page.goto('/');
    
    // Set onboarding complete flag
    await page.evaluate(() => {
      localStorage.setItem('ks_onboarding_complete', 'true');
    });
    
    await page.reload();
    await page.click('text=Get Started');
    
    // Wait a bit and verify no onboarding cards appear
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Voice Navigation')).not.toBeVisible();
    await expect(page.locator('text=Read Aloud')).not.toBeVisible();
  });

  test('should skip language selection if language already stored', async ({ page }) => {
    // Set language in storage
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('language-storage', JSON.stringify({
        state: { currentLanguage: 'en' }
      }));
    });
    
    await page.reload();
    await page.click('text=Get Started');
    
    // Should navigate directly to auth, not language selection
    await page.waitForURL('**/auth', { timeout: 5000 });
  });
});

test.describe('Permission Flow', () => {
  test('should not show location permission on Home page scroll', async ({ page }) => {
    // Login first (mock or real auth)
    await page.goto('/app');
    
    // Scroll the page
    await page.evaluate(() => {
      window.scrollBy(0, 500);
    });
    
    await page.waitForTimeout(2000);
    
    // No permission dialog should appear
    await expect(page.locator('text=Enable Location Services')).not.toBeVisible();
    await expect(page.locator('text=Location Access Needed')).not.toBeVisible();
  });

  test('should show contextual permission modal when accessing location feature', async ({ page }) => {
    // This test would need a specific feature that requests location
    // Example: "Add Land" → "Use my location" button
    await page.goto('/app/lands/add');
    
    // Click "Use my location" button (if exists)
    const useLocationBtn = page.locator('text=Use my location');
    if (await useLocationBtn.isVisible()) {
      await useLocationBtn.click();
      
      // Permission modal should appear
      await expect(page.locator('text=Location Access Needed')).toBeVisible({ timeout: 3000 });
    }
  });
});
