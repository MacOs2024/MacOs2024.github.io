import { test, expect } from '@playwright/test';

const loader = 'https://yandex.ru/ads/system/context.js';
test.beforeEach(async ({ page }) => {
  await page.route('https://mc.yandex.ru/**', route => route.abort());
});

test('РСЯ: отложенный загрузчик получает один блок, печать без рекламы', async ({ page }) => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  await page.route(loader, async route => {
    await ready;
    await route.fulfill({ contentType: 'application/javascript', body: `
      window.adCalls=[];
      window.Ya={Context:{AdvManager:{render:function(options){
        window.adCalls.push(options);
        document.getElementById(options.renderTo).textContent='Тестовый баннер';
      }}}};
      window.yaContextCb.forEach(function(callback){callback()});
    ` });
  });
  await page.goto('/zakon-oma.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#go').click();
  await expect(page.locator('#res')).toBeVisible();
  release();
  await expect(page.locator('.yan-ad-slot')).toHaveText('Тестовый баннер');
  expect(await page.evaluate(() => window.adCalls)).toEqual([
    { blockId: 'R-A-19823062-1', renderTo: 'yandex_rtb_R-A-19823062-1' },
  ]);
  await page.locator('#go').click();
  expect(await page.evaluate(() => window.adCalls.length)).toBe(1);
  expect(await page.evaluate(() => document.querySelector('.card').nextElementSibling.className)).toBe('yan-ad');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.yan-ad')).toBeHidden();
});

test('блокировка рекламы не мешает расчёту; служебные страницы без рекламы', async ({ page }) => {
  await page.route(loader, route => route.abort());
  await page.goto('/zakon-oma.html');
  await page.locator('#go').click();
  await expect(page.locator('#res')).toBeVisible();
  for (const path of ['/', '/privacy.html', '/about.html', '/gasyashchiy-kondensator.html']) {
    await page.goto(path);
    await expect(page.locator('script[src="' + loader + '"]')).toHaveCount(0);
    await expect(page.locator('.yan-ad')).toHaveCount(0);
  }
});
