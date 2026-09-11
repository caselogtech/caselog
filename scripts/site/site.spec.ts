import { expect, test } from '@playwright/test';

test('homepage and contact work on desktop, mobile, and without JavaScript', async ({
  page,
  request,
  browser,
  baseURL,
}, testInfo) => {
  if (!baseURL) throw new Error('Site base URL is required');
  const errors: string[] = [];
  const failedAssets: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failedAssets.push(response.url());
  });
  for (const path of ['', 'contact/']) {
    const response = await page.goto(new URL(path, baseURL).href);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\w/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https:\/\//);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('600 16px Figtree'))).toBe(true);
    const localLinks = await page
      .locator('a[href]')
      .evaluateAll((elements) => elements.map((element) => (element as HTMLAnchorElement).href));
    for (const href of new Set(localLinks)) {
      const url = new URL(href);
      if (url.origin !== new URL(baseURL).origin) continue;
      const result = await request.get(url.href);
      expect(result.status(), href).toBe(200);
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 960 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${path} at ${width}px`,
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${path ? 'contact' : 'home'}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(baseURL);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Contact' })
    .click();
  await expect(page.locator('h1')).toContainText('conversation');
  await expect(page.getByRole('link', { name: 'Write an email' })).toHaveAttribute(
    'href',
    'mailto:ivan.pelykh@protonmail.com?subject=Hello%20Caselog',
  );
  const question = page
    .locator('summary')
    .filter({ hasText: 'Can we try Caselog without paying?' });
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('details[open]')).toContainText(
    'without a subscription or license fee',
  );
  expect(await page.locator('form').count()).toBe(0);
  expect(errors).toEqual([]);
  expect(failedAssets).toEqual([]);

  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const staticPage = await context.newPage();
    await staticPage.goto(new URL('contact/', baseURL).href);
    await staticPage
      .locator('summary')
      .filter({ hasText: 'Is Caselog a stable 1.0 release?' })
      .click();
    await expect(staticPage.locator('details[open]')).toContainText('current MVP is 0.1.0');
    await expect(staticPage.getByRole('link', { name: 'Write an email' })).toBeVisible();
  } finally {
    await context.close();
  }
  const missing = await request.get(new URL('missing-page/', baseURL).href);
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain('This page is missing.');
});
