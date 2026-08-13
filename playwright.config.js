import { defineConfig, devices } from '@playwright/test';

// Браузерные проверки. jsdom не выполняет layout и rendering, поэтому
// горизонтальный скролл, работу поиска и печать проверяем в настоящем
// браузере, а не в тестах на jsdom.
export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8000',
    // Трассировку и скриншот собираем только при падении, чтобы прогон
    // оставался быстрым.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // В CI браузер ставится штатно через `playwright install`. Переменная
    // нужна только для окружений с уже предустановленным Chromium другой
    // сборки, где скачивать браузер нельзя.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'python3 -m http.server 8000',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: !process.env.CI,
  },
});
