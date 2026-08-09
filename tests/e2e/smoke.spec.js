import { test, expect } from '@playwright/test';

// Web-first assertions (toBeVisible и т.п.) вместо мгновенных проверок:
// они сами дожидаются состояния и не флакают.

test.describe('Главная', () => {
  test('загружается и показывает каталог', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.ccard').first()).toBeVisible();
    // Снятый калькулятор не должен быть в каталоге.
    await expect(page.locator('a.ccard[href="gasyashchiy-kondensator.html"]')).toHaveCount(0);
  });

  test('поиск фильтрует карточки и показывает пустое состояние', async ({ page }) => {
    await page.goto('/');
    const total = await page.locator('.ccard').count();
    expect(total).toBeGreaterThan(50);

    await page.fill('#q', 'сечение');
    await expect(page.locator('.ccard:visible').first()).toBeVisible();
    const filtered = await page.locator('.ccard:visible').count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);

    await page.fill('#q', 'заведомоНичегоНеНайдётся');
    await expect(page.locator('.ccard:visible')).toHaveCount(0);
    await expect(page.locator('#empty')).toBeVisible();

    await page.fill('#q', '');
    await expect(page.locator('#empty')).toBeHidden();
    expect(await page.locator('.ccard:visible').count()).toBe(total);
  });

  test('переход по карточке открывает калькулятор', async ({ page }) => {
    await page.goto('/');
    await page.locator('a.ccard[href="zakon-oma.html"]').click();
    await expect(page).toHaveURL(/zakon-oma\.html$/);
    await expect(page.locator('#go')).toBeVisible();
  });
});

test.describe('Калькулятор', () => {
  test('считает, принимает запятую и повторяет расчёт', async ({ page }) => {
    await page.goto('/zakon-oma.html');
    await expect(page.locator('#res')).toBeHidden();

    await page.fill('#u', '12');
    await page.fill('#r', '6');
    await page.click('#go');
    await expect(page.locator('#res')).toBeVisible();
    await expect(page.locator('#res')).toContainText('Ток I');

    // Запятая как десятичный разделитель.
    await page.fill('#u', '12,5');
    await page.fill('#r', '6');
    await page.click('#go');
    // 12,5 / 6 = 2,0833..., на странице округляется до 4 значащих цифр.
    await expect(page.locator('#res')).toContainText('2,083');
    await expect(page.locator('#res')).toContainText('Напряжение U12,5 В');
  });

  test('кнопка PDF появляется после расчёта и вызывает печать без ошибок', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message));

    await page.goto('/zakon-oma.html');
    // До расчёта кнопка скрыта.
    await expect(page.locator('#pdf')).toBeHidden();

    await page.fill('#u', '12');
    await page.fill('#r', '6');
    await page.click('#go');
    await expect(page.locator('#pdf')).toBeVisible();

    // window.print в headless открыл бы диалог — подменяем и проверяем вызов.
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.click('#pdf');
    expect(await page.evaluate(() => window.__printed)).toBe(1);
    // Печатная шапка должна быть заполнена датой.
    await expect(page.locator('#pdate')).toContainText(/\d{2}\.\d{2}\.\d{4}/);
    expect(jsErrors).toEqual([]);
  });

  test('страница снятого калькулятора не содержит формы', async ({ page }) => {
    await page.goto('/gasyashchiy-kondensator.html');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.rerr')).toBeVisible();
    await expect(page.locator('#go')).toHaveCount(0);
    await expect(page.locator('input')).toHaveCount(0);
  });

  test('ток КЗ: контрпример аудита не даёт положительный вердикт', async ({ page }) => {
    await page.goto('/tok-korotkogo-zamykaniya.html');
    await page.fill('#u', '220');
    await page.fill('#z', '1,2');
    await page.selectOption('#src', 'meas');
    await page.selectOption('#kv', '0.8');
    await page.selectOption('#tip', '10');
    await page.fill('#in', '16');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('Не проходит');
    await expect(page.locator('#res')).not.toContainText('СтатусПроходит');
  });
});

test.describe('Вёрстка', () => {
  const pages = ['/', '/zakon-oma.html', '/tok-korotkogo-zamykaniya.html', '/sechenie-pe-provodnika.html'];

  for (const url of pages) {
    test(`нет горизонтального скролла: ${url}`, async ({ page }) => {
      await page.goto(url);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `страница шире экрана на ${overflow}px`).toBeLessThanOrEqual(0);
    });
  }

  test('нет JS-ошибок при загрузке и расчёте', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message));
    await page.goto('/sechenie-pe-provodnika.html');
    await page.fill('#s', '50');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('25 мм²');
    expect(jsErrors).toEqual([]);
  });
});
