import { instant } from '@next/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * These tests lock in the instant navigations enabled by Cache Components +
 * Partial Prefetching (next.config.ts) and the `<a>` -> `<Link>` navbar
 * conversion.
 *
 * The `instant()` helper scopes the assertions inside its callback to the UI
 * that is available the moment a navigation starts, *without* waiting for a
 * server round-trip. If the destination content only shows up after the
 * network responds, the assertion fails — which is exactly the regression we
 * want to catch.
 *
 * Prefetching only runs in a production build, so playwright.config.ts serves
 * `next build` + `next start` (not the dev server).
 */

// The home canvas grid — the stable, data-independent landmark shared by the
// navigations under test.
const photoGrid = (page: Page) =>
  page.getByRole('application', { name: 'Pannable photo grid' });

test.describe('instant navigations', () => {
  test('navbar: map -> canvas lands on the grid immediately', async ({
    page,
  }) => {
    await page.goto('/map');

    // The navbar is part of the static shell on /map (rendered eagerly, not
    // lazy), so the Canvas link is present without waiting on idle callbacks.
    const canvasLink = page.getByRole('link', { name: 'Canvas' });
    await canvasLink.waitFor();

    await instant(page, async () => {
      await canvasLink.click();
      // Home is fully static (`'use cache'`), so its prefetched shell *is* the
      // page — the grid is there the instant the navigation begins.
      await expect(photoGrid(page)).toBeVisible();
    });
  });

  test('navbar: map -> timeline switches views immediately', async ({
    page,
  }) => {
    await page.goto('/map');

    const timelineLink = page.getByRole('link', { name: 'Timeline' });
    await timelineLink.waitFor();

    await instant(page, async () => {
      await timelineLink.click();
      await expect(page).toHaveURL(/\/timeline$/);
      // The timeline renders its own navbar in the static shell; the Map link
      // (shown because Timeline is the active page) proves the shell is up
      // without a network hop.
      await expect(page.getByRole('link', { name: 'Map' })).toBeVisible();
    });
  });

  test('"Back to gallery" from a photo page is instant', async ({ page }) => {
    // Derive a real photo id from the grid instead of hardcoding one.
    await page.goto('/');
    const firstTile = page.locator('a[href^="/photo/"]').first();
    await firstTile.waitFor();
    const href = await firstTile.getAttribute('href');
    expect(href).toBeTruthy();

    // Visit the full photo page directly (bypassing the intercepting modal).
    await page.goto(href!);

    const backLink = page.getByRole('link', { name: 'Back to gallery' });
    await backLink.waitFor();

    await instant(page, async () => {
      await backLink.click();
      await expect(photoGrid(page)).toBeVisible();
    });
  });
});
