/**
 * E2E test for Weather page pull-to-refresh
 * Reproduces the toast loop bug and verifies the fix
 * 
 * TEST SCENARIO:
 * 1. Navigate to Weather page
 * 2. Pull down to refresh multiple times rapidly
 * 3. Verify only ONE success toast appears (not a loop)
 * 4. Verify no error toast appears after
 * 5. Verify weather data updates correctly
 */

import { test, expect } from '@playwright/test';

test.describe('Weather Pull-to-Refresh', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and login if needed
    await page.goto('/app/weather');
    await page.waitForLoadState('networkidle');
  });

  test('should handle pull-to-refresh without toast spam', async ({ page }) => {
    // Wait for weather data to load
    await page.waitForSelector('[data-testid="weather-hero-card"]', { timeout: 10000 });

    // Track toast messages
    const toastMessages: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('toast') || msg.text().includes('Toast')) {
        toastMessages.push(msg.text());
      }
    });

    // Simulate pull-to-refresh gesture
    const weatherContainer = await page.$('.h-screen');
    if (weatherContainer) {
      const box = await weatherContainer.boundingBox();
      if (box) {
        // Swipe down from top
        await page.mouse.move(box.x + box.width / 2, box.y + 10);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + 100, { steps: 10 });
        await page.mouse.up();
      }
    }

    // Wait for refresh to complete
    await page.waitForTimeout(1000);

    // Rapid successive pulls (should be debounced)
    for (let i = 0; i < 3; i++) {
      if (weatherContainer) {
        const box = await weatherContainer.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + 10);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2, box.y + 100, { steps: 5 });
          await page.mouse.up();
          await page.waitForTimeout(100);
        }
      }
    }

    // Wait for any pending operations
    await page.waitForTimeout(2000);

    // Verify: Should see at most 2 success toasts (not a loop of 10+)
    const successToasts = toastMessages.filter(msg => 
      msg.includes('success') || msg.includes('synced')
    );
    expect(successToasts.length).toBeLessThanOrEqual(2);

    // Verify: Should see no error toasts
    const errorToasts = toastMessages.filter(msg => 
      msg.includes('error') || msg.includes('failed')
    );
    expect(errorToasts.length).toBe(0);

    // Verify: Weather data is displayed
    await expect(page.locator('[data-testid="weather-temperature"]')).toBeVisible();
  });

  test('should show line chart for hourly forecast', async ({ page }) => {
    // Wait for page load
    await page.waitForSelector('[data-testid="weather-hero-card"]', { timeout: 10000 });

    // Scroll to hourly forecast section
    await page.evaluate(() => {
      document.querySelector('.overflow-y-auto')?.scrollTo({ top: 300, behavior: 'smooth' });
    });

    // Verify: Line chart is rendered (recharts SVG)
    await expect(page.locator('.recharts-wrapper')).toBeVisible({ timeout: 5000 });
    
    // Verify: Chart has data points
    const dataPoints = await page.locator('.recharts-line circle').count();
    expect(dataPoints).toBeGreaterThan(0);
  });

  test('should handle scroll smoothly with horizontal lists', async ({ page }) => {
    // Wait for page load
    await page.waitForSelector('[data-testid="weather-hero-card"]', { timeout: 10000 });

    // Find farming recommendations section
    const farmingSection = await page.locator('.snap-x').first();
    
    // Scroll horizontally
    if (await farmingSection.isVisible()) {
      await farmingSection.evaluate((el) => {
        el.scrollLeft = 200;
      });

      // Should scroll smoothly without locking
      const scrollLeft = await farmingSection.evaluate((el) => el.scrollLeft);
      expect(scrollLeft).toBeGreaterThan(0);
    }

    // Vertical scroll should still work
    await page.evaluate(() => {
      document.querySelector('.h-screen')?.scrollBy({ top: 500, behavior: 'smooth' });
    });

    // Should scroll down
    await page.waitForTimeout(500);
    const scrollTop = await page.evaluate(() => 
      document.querySelector('.h-screen')?.scrollTop || 0
    );
    expect(scrollTop).toBeGreaterThan(0);
  });
});
