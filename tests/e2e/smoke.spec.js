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

  test('поиск понимает порядок слов, формы слов, регистр и ё/е', async ({ page }) => {
    await page.goto('/');
    const hrefs = async () => page.locator('.ccard:visible').evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('href')).sort());

    await page.fill('#q', 'кабель сечение');
    const cableA = await hrefs();
    await page.fill('#q', 'сечение кабеля');
    const cableB = await hrefs();
    expect(cableA.length).toBeGreaterThan(0);
    expect(cableB).toEqual(cableA);

    await page.fill('#q', 'автоматический выключатель');
    const breakerA = await hrefs();
    await page.fill('#q', 'выключатель автоматический');
    const breakerB = await hrefs();
    expect(breakerA.length).toBeGreaterThan(0);
    expect(breakerB).toEqual(breakerA);

    await page.fill('#q', 'ТЁПЛЫЙ');
    const warmA = await hrefs();
    await page.fill('#q', 'теплый');
    expect(await hrefs()).toEqual(warmA);
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
    await page.selectOption('#zbasis', 'design');
    await page.selectOption('#tip', '10');
    await page.fill('#in', '16');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('Условие метода не выполняется');
    await expect(page.locator('#res')).not.toContainText('СтатусПроходит');
  });

  test('ток КЗ: обычное измерение не получает положительный вывод', async ({ page }) => {
    await page.goto('/tok-korotkogo-zamykaniya.html');
    await page.fill('#u', '220');
    await page.fill('#z', '0,5');
    await page.selectOption('#zbasis', 'measured');
    await page.selectOption('#tip', '10');
    await page.fill('#in', '16');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('Недостаточно данных');
    await expect(page.locator('#res')).not.toContainText('Условие метода выполняется');
  });

  test('отдельный PE применяет механические минимумы', async ({ page }) => {
    await page.goto('/sechenie-pe-provodnika.html');
    await page.fill('#s', '1,5');
    await page.selectOption('#layout', 'separate-protected');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('Расчётное сечение PE2,5 мм²');
    await page.selectOption('#layout', 'separate-unprotected');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('Расчётное сечение PE4 мм²');
  });

  test('автомат не выдаёт положительный вывод без Iz и тока КЗ', async ({ page }) => {
    await page.goto('/vybor-avtomata.html');
    await page.fill('#p', '3,5');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('Недостаточно данных');
    await page.fill('#iz', '19');
    await page.fill('#isc', '1,5');
    await page.selectOption('#icn', '6');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('Базовые условия выполняются');
    await expect(page.locator('#res')).not.toContainText('характеристика C');
  });

  test('заземление блокирует простое деление при близких стержнях', async ({ page }) => {
    await page.goto('/raschet-zazemleniya.html');
    await page.fill('#rho', '100');
    await page.fill('#l', '2,5');
    await page.fill('#n', '2');
    await page.fill('#a', '10');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('Недостаточно данных');
    await page.fill('#a', '10,1');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('20 Ом');
    await expect(page.locator('#res')).toContainText('требуется измерение');
  });

  test('молниезащита использует кусочные коэффициенты до 150 м', async ({ page }) => {
    await page.goto('/molniezashchita.html');
    await page.fill('#h', '150');
    await page.selectOption('#nad', '0.999');
    await page.fill('#hx', '0');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('Высота конуса защиты h₀90 м');
    await expect(page.locator('#res')).toContainText('Радиус зоны у земли r₀60 м');
  });
});

test.describe('Вёрстка', () => {
  test('весь каталог загружается без JS-ошибок и горизонтального скролла', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      // Недоступность стороннего счётчика — не дефект наших страниц: расчёт и
      // вёрстка обязаны работать без сети. Отсеиваем строго по источнику
      // сообщения, а не по тексту, иначе вместе с Метрикой замолчали бы и
      // настоящие битые ресурсы сайта.
      const from = message.location()?.url ?? '';
      if (/^https:\/\/mc\.yandex\.ru\//.test(from)) return;
      errors.push(`${message.text()} @ ${from}`);
    });
    await page.goto('/');
    const urls = await page.locator('.ccard').evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('href')));
    for (const url of ['/', ...urls]) {
      // domcontentloaded, а не load: ждать внешний счётчик на каждой из ста
      // страниц незачем — проверяются вёрстка и ошибки JS, а не сеть Яндекса.
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${url}: страница шире экрана на ${overflow}px`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });

  test('нет JS-ошибок при загрузке и расчёте', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message));
    await page.goto('/sechenie-pe-provodnika.html');
    await page.fill('#s', '50');
    await page.click('#go');
    await expect(page.locator('#res')).toContainText('25 мм²');
    expect(jsErrors).toEqual([]);
  });

  test('печатный режим скрывает интерфейс и показывает результат', async ({ page }) => {
    await page.goto('/zakon-oma.html');
    await page.fill('#u', '12');
    await page.fill('#r', '6');
    await page.click('#go');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.top')).toBeHidden();
    await expect(page.locator('#go')).toBeHidden();
    await expect(page.locator('#printhead')).toBeVisible();
    await expect(page.locator('#res')).toBeVisible();
  });

  test('страница о проекте доступна из подвала и объясняет статусы', async ({ page }) => {
    // Путь посетителя: с калькулятора в подвал — и к тому, кто отвечает за
    // расчёт. Проверяем именно переход, а не прямой заход по адресу.
    await page.goto('/zakon-oma.html');
    await page.locator('footer a[href="about.html"]').click();
    await expect(page).toHaveURL(/about\.html$/);
    await expect(page.locator('h1')).toHaveText('О проекте');

    // Ключевое обещание страницы: честно сказано, что подписи инженера нет.
    await expect(page.locator('.rerr')).toContainText('независимо проверено');
    await expect(page.locator('table.t')).toBeVisible();

    // Обратный путь в каталог не должен быть тупиком.
    await page.locator('footer a[href="index.html"]').click();
    await expect(page.locator('.ccard').first()).toBeVisible();
  });

  test('аналитика работает в оговоренном политикой объёме', async ({ page }) => {
    const tracked = [];
    page.on('request', request => {
      if (/yandex\.(ru|com)|mc\.yandex/.test(request.url())) tracked.push(request.url());
    });

    // На странице каталога счётчик обязан сработать.
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(tracked.some(u => /metrika\/tag\.js\?id=111301996/.test(u)),
      `запросов к Метрике не было: ${tracked.join(', ')}`).toBe(true);
    expect(await page.evaluate(() => typeof window.ym)).toBe('function');

    // Вебвизор не должен подгружать свой модуль записи сессий.
    expect(tracked.filter(u => /webvisor/i.test(u))).toEqual([]);

    // Страница политики себя не считает и раскрывает обязательные пункты.
    tracked.length = 0;
    await page.goto('/privacy.html');
    await page.waitForLoadState('networkidle');
    expect(tracked, `политика не должна дёргать Метрику: ${tracked.join(', ')}`).toEqual([]);
    await expect(page.locator('body')).toContainText('Яндекс.Метрика');
    await expect(page.locator('body')).toContainText('111301996');
    await expect(page.locator('body')).toContainText('Как отказаться');
  });
});
