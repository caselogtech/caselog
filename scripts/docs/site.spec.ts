import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('documentation links, search, mobile navigation, and missing pages work independently', async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  if (!baseURL) throw new Error('Documentation base URL is required');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const output = resolve('apps/docs/dist');
  const entries = await readdir(output, { recursive: true });
  const pages = entries.filter((entry) => entry === 'index.html' || entry.endsWith('/index.html'));
  expect(pages.length).toBeGreaterThanOrEqual(15);
  const anchors = new Map<string, Set<string>>();
  const links = new Set<string>();

  for (const entry of pages) {
    const path = relative(output, join(output, entry)).replace(/index\.html$/, '');
    const url = new URL(path, baseURL).href;
    const response = await page.goto(url);
    expect(response?.status(), url).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    anchors.set(
      new URL(url).pathname,
      new Set(
        await page.locator('[id]').evaluateAll((elements) => elements.map((element) => element.id)),
      ),
    );
    for (const href of await page
      .locator('a[href]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('href') ?? ''))) {
      const target = new URL(href, url);
      if (target.origin === new URL(baseURL).origin) links.add(target.href);
    }
  }

  for (const link of links) {
    const url = new URL(link);
    const ids = anchors.get(url.pathname);
    if (ids) {
      if (url.hash) expect(ids.has(decodeURIComponent(url.hash.slice(1))), link).toBe(true);
    } else {
      const response = await request.get(link);
      expect(response.status(), link).toBe(200);
    }
  }

  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Search', exact: false }).click();
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('test case');
  const result = page.locator('.pagefind-ui__result-link').first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.locator('h1')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Create and maintain test cases', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Create and maintain test cases', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Create and maintain test cases');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('cases-mobile.png'), fullPage: true });

  const missing = await request.get(new URL('missing-documentation-page/', baseURL).href);
  expect(missing.status()).toBe(404);
  const api = await request.get(new URL('downloads/openapi.json', baseURL).href);
  expect(api.status()).toBe(200);
  expect((await api.json()).info.version).toBe('0.1.0');
  expect(errors).toEqual([]);
  console.log(`Verified ${pages.length} documentation pages and ${links.size} internal links.`);
});
