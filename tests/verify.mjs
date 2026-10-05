import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(testDir, "..");
const failures = [];
let checks = 0;
// Разбивка обязательна: общее число проверок само по себе ничего не говорит
// о корректности формул — большая их часть структурная.
const byKind = { structural: 0, functional: 0, boundary: 0 };
let kind = "structural";
const scenarioCounts = new Map();

function recordScenario(file) {
  scenarioCounts.set(file, (scenarioCounts.get(file) ?? 0) + 1);
}

function check(condition, message) {
  checks += 1;
  byKind[kind] += 1;
  if (!condition) failures.push(message);
}

async function load(file, options = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => errors.push(error.message));
  virtualConsole.on("error", error => errors.push(String(error)));
  const html = fs.readFileSync(path.join(sourceDir, file), "utf8");
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: `https://example.test/${file}`,
    virtualConsole,
    beforeParse(window) {
      if (options.analyticsConsent)
        window.localStorage.setItem("voltcalc.analytics-consent.v1", options.analyticsConsent);
    },
  });
  dom.__runtimeErrors = errors;
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  check(errors.length === 0, `${file}: ошибка выполнения JS: ${errors.join("; ")}`);
  return dom;
}

function setValues(document, values) {
  for (const [id, value] of Object.entries(values)) {
    const element = document.getElementById(id);
    check(Boolean(element), `Не найден элемент #${id}`);
    if (!element) continue;
    element.value = String(value);
    element.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
  }
}

async function calculate(file, values, expected, scenarioKind = "functional") {
  kind = scenarioKind;
  recordScenario(file);
  const dom = await load(file);
  const { document } = dom.window;
  setValues(document, values);
  const button = document.getElementById("go");
  check(Boolean(button), `${file}: отсутствует кнопка расчёта`);
  button?.click();
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  check(dom.__runtimeErrors.length === 0, `${file}: ошибка JS после расчёта: ${dom.__runtimeErrors.join("; ")}`);
  const result = document.getElementById("res")?.textContent.replace(/\s+/g, " ").trim() ?? "";
  for (const fragment of expected) {
    check(result.includes(fragment), `${file}: ожидалось «${fragment}», получено «${result}»`);
  }
  dom.window.close();
}

// Служебные файлы в корне — не страницы сайта: их не проверяем как калькуляторы,
// но следим, чтобы они не пропали при пересборке.
const serviceFiles = ["yandex_eb993645a776a164.html", "google42573797fafc16a7.html"];
for (const file of serviceFiles) {
  check(fs.existsSync(path.join(sourceDir, file)), `Отсутствует служебный файл ${file}`);
}
check(fs.existsSync(path.join(sourceDir, "favicon.svg")), "Отсутствует favicon.svg");
check(fs.existsSync(path.join(sourceDir, "og-image.png")), "Отсутствует og-image.png для Open Graph");

// Страницы без калькулятора: расчёт снят с публикации, осталось объяснение.
// Их не проверяем как калькуляторы и не ждём в sitemap, но следим, чтобы на
// них не вернулась форма расчёта.
const noticePages = ["gasyashchiy-kondensator.html"];

// Политика конфиденциальности и «О проекте» — текстовые страницы сайта, а не
// калькуляторы: у них свой набор требований, проверяются отдельными блоками
// ниже. Разница между ними принципиальная: privacy закрыт от индексации,
// about — наоборот, обязан индексироваться и попадать в sitemap.
const infoPages = ["privacy.html", "about.html"];

const htmlFiles = fs.readdirSync(sourceDir)
  .filter(file => file.endsWith(".html") && !serviceFiles.includes(file) && !infoPages.includes(file))
  .sort();
check(htmlFiles.length === 152, `Ожидалось 152 HTML-файла, найдено ${htmlFiles.length}`);

// Совет закоротить заряженный конденсатор перемычкой, отвёрткой или
// закороткой опасен: при запасённой энергии это даёт дугу и разбрызгивание
// металла, а из-за диэлектрической абсорбции заряд частично возвращается,
// и схема снова оказывается под напряжением. Разряд выполняется резистором
// с последующим измерением. Проверяем весь каталог, а не одну страницу:
// такой совет одинаково опасен везде, где есть накопитель энергии.
{
  kind = "structural";
  const dangerous = [
    /замыка(ют|ть|я)[^.]{0,40}перемычк/i,
    /закорач(ивают|ивать)[^.]{0,40}(конденсатор|перемычк)/i,
    /разряд(ить|ают)[^.]{0,30}отвёртк/i,
    /конденсатор[^.]{0,40}отвёртк/i,
  ];
  for (const file of [...htmlFiles, ...infoPages]) {
    // Проверяем видимый текст: микроразметка и скрипты строятся из тех же
    // полей данных, а экранированные в них теги рвут границы предложений.
    // Разметку убираем — иначе тег внутри фразы теряет отрицание.
    const text = fs.readFileSync(path.join(sourceDir, file), "utf8")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const pattern of dangerous) {
      const hit = text.match(pattern);
      if (!hit) continue;
      // Предложение целиком: «Не замыкайте… перемычкой» — предупреждение,
      // а не совет. Отрицание ищем во всём предложении, а не в 20 символах
      // перед совпадением: разметка и вводные слова легко сдвигают границу.
      const from = text.lastIndexOf(".", hit.index) + 1;
      const to = text.indexOf(".", hit.index + hit[0].length);
      const sentence = text.slice(from, to === -1 ? text.length : to + 1);
      // Без \b: в JavaScript граница слова определена только по латинице,
      // поэтому \bне на кириллице не срабатывает никогда.
      const warns = /(^|[\s(«"])(не|нельзя|запрещ|недопустим|опасн)/i.test(sentence);
      check(warns,
        `${file}: опасный совет закоротить заряженный конденсатор: «${sentence.trim().slice(0, 120)}»`);
    }
  }
}

// P1-5: аналитика включена по решению владельца, но строго в оговоренном
// политикой объёме. Счётчик обязан быть на каждой странице каталога,
// поведенческий трекинг обязан оставаться выключенным, а сама страница
// политики — не считать своего читателя.
{
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(sourceDir, file), "utf8");
    check(/mc\.yandex\.ru\/metrika\/tag\.js\?id=111301996/.test(html), `${file}: не подключён счётчик Яндекс.Метрики`);
    check(/webvisor\s*:\s*false/.test(html), `${file}: Вебвизор должен быть явно выключен`);
    check(/clickmap\s*:\s*false/.test(html), `${file}: карта кликов должна быть явно выключена`);
    check(!/webvisor\s*:\s*true|clickmap\s*:\s*true/.test(html), `${file}: включён поведенческий трекинг`);
  }
  const privacy = fs.readFileSync(path.join(sourceDir, "privacy.html"), "utf8");
  check(!/mc\.yandex\./.test(privacy), "privacy.html: на странице политики счётчика быть не должно");
  for (const required of ["Яндекс.Метрика", "cookie", "Вебвизор", "GitHub Pages", "Обратная связь", "111301996", "Как отказаться"]) {
    check(privacy.includes(required), `privacy.html: не раскрыт обязательный пункт «${required}»`);
  }
  // Политика обязана описывать ровно то, что делает код: если Вебвизор
  // когда-нибудь включат, текст «записи не ведутся» станет ложью.
  check(/не ведутся/.test(privacy), "privacy.html: не сказано, что записи сессий не ведутся");
  check(/noindex/.test(privacy), "privacy.html: служебная страница должна быть закрыта от индексации");

  // «О проекте» закрывает анонимность сайта: для расчётов, влияющих на
  // безопасность, поисковые системы требуют понимать, кто отвечает за
  // содержание и как оно проверяется. Страница обязана индексироваться.
  const about = fs.readFileSync(path.join(sourceDir, "about.html"), "utf8");
  check(!/noindex/.test(about), "about.html: страница о проекте не должна быть закрыта от индексации");
  check(/<link rel="canonical" href="https:\/\/macos2024\.github\.io\/about\.html">/.test(about),
    "about.html: нет canonical");
  check(/mc\.yandex\.ru\/metrika\/tag\.js\?id=111301996/.test(about), "about.html: не подключён счётчик");
  // Страница доверия обязана иметь ту же разметку, что и калькуляторы:
  // без неё поиск не свяжет сайт с его издателем.
  check(/<meta property="og:image:width"/.test(about), "about.html: Open Graph усечён, нет размеров картинки");
  const aboutLd = about.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  check(Boolean(aboutLd), "about.html: нет JSON-LD");
  if (aboutLd) {
    let graph = null;
    try { graph = JSON.parse(aboutLd[1].replace(/\\u003c/g, "<"))["@graph"]; }
    catch (error) { check(false, `about.html: JSON-LD не парсится: ${error.message}`); }
    const types = (graph ?? []).map(node => node["@type"]);
    for (const required of ["WebPage", "Organization", "BreadcrumbList"]) {
      check(types.includes(required), `about.html: в разметке нет узла ${required}`);
    }
  }
  for (const required of [
    "Кто ведёт проект",       // страница не анонимна: у неё есть автор
    "Максим",                 // имя, а не безликая редакция
    "не претендует на заключение дипломированного инженера", // честно об отсутствии диплома
    "ИИ-инструментов",        // проверка формул раскрыта, а не выдаётся за ручную работу инженера
    "Основание расчёта",      // объяснение карточки источника
    "независимо проверено",   // честное признание, что подписи инженера нет
    "ENGINEERING_AUDIT.md",   // куда смотреть за статусами
    "не заменяют",            // отказ от нормативной ответственности
    "Нашли ошибку",           // канал обратной связи
    "issues",                 // конкретный способ сообщить
  ]) {
    check(about.includes(required), `about.html: не раскрыт обязательный пункт «${required}»`);
  }
  // Страница обязана быть в sitemap: она несёт сигнал доверия для поиска.
  const sitemapXml = fs.readFileSync(path.join(sourceDir, "sitemap.xml"), "utf8");
  check(sitemapXml.includes("https://macos2024.github.io/about.html"), "sitemap.xml: нет about.html");
  check(!sitemapXml.includes("privacy.html"), "sitemap.xml: страница с noindex не должна быть в sitemap");
  // Ссылка на «О проекте» должна быть доступна с любой страницы каталога.
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(sourceDir, file), "utf8");
    check(html.includes('href="about.html"'), `${file}: нет ссылки на страницу о проекте`);
  }
  // Пробелы схлопываем: правила свёрстаны по ширине, и фраза может быть
  // разорвана переносом строки — тест не должен ломаться от переформатирования.
  const projectRules = fs.readFileSync(path.join(sourceDir, "PROJECT_RULES.md"), "utf8")
    .replace(/\s+/g, " ");
  for (const required of ["111301996", "без баннера согласия", "webvisor", "clickmap", "запись сессий не ведётся"])
    check(projectRules.includes(required), `PROJECT_RULES.md: privacy-решение не фиксирует «${required}»`);
  // Ссылка на политику должна быть доступна с любой страницы сайта.
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(sourceDir, file), "utf8");
    check(html.includes('href="privacy.html"'), `${file}: нет ссылки на политику конфиденциальности`);
    // Отказ от аналитики описан в политике, ссылка на которую есть выше.
    // Отдельная кнопка управления согласием была бы мёртвым элементом
    // интерфейса — правило 7 такое запрещает, поэтому её быть не должно.
    check(!html.includes("data-analytics-settings"), `${file}: остался неработающий элемент управления согласием`);
  }

  // Принятое решение — счётчик без баннера согласия. Проверяем фактическое
  // поведение кода: на странице политики счётчика нет вовсе, а в каталоге он
  // инициализируется ровно с теми параметрами, которые обещает политика.
  const privacyDom = await load("privacy.html");
  check(typeof privacyDom.window.ym === "undefined", "privacy.html: страница политики не должна запускать Метрику");
  check(!privacyDom.window.document.querySelector('script[src*="mc.yandex"]'), "privacy.html: на странице политики подключён tag.js");
  privacyDom.window.close();

  const indexDom = await load("index.html");
  check(typeof indexDom.window.ym === "function", "index.html: Метрика не инициализирована");
  const initCall = indexDom.window.ym?.a?.find(args => args[1] === "init");
  check(Boolean(initCall), "index.html: не найден вызов ym(id, 'init')");
  check(initCall?.[0] === 111301996, "index.html: init вызван с чужим номером счётчика");
  check(initCall?.[2]?.webvisor === false, "index.html: Вебвизор не выключен в параметрах init");
  check(initCall?.[2]?.clickmap === false, "index.html: карта кликов не выключена в параметрах init");
  indexDom.window.close();
}

for (const file of htmlFiles) {
  const dom = await load(file);
  const { document } = dom.window;
  check(document.documentElement.lang === "ru", `${file}: не указан lang=ru`);
  check(Boolean(document.querySelector("meta[name=viewport]")), `${file}: нет viewport`);
  check(Boolean(document.querySelector("meta[name=description]")?.content.trim()), `${file}: нет meta description`);
  check(Boolean(document.querySelector("h1")), `${file}: нет h1`);
  check(document.querySelector('link[rel=icon]')?.getAttribute("href") === "favicon.svg", `${file}: не подключён favicon.svg`);
  check(document.querySelector("footer")?.textContent.includes("справочный характер"), `${file}: нет обязательного дисклеймера`);
  // Единственная разрешённая внешняя зависимость — счётчик Метрики.
  // Всё остальное (CDN, шрифты, чужие трекеры) по-прежнему запрещено:
  // страница обязана считать и печатать без сети.
  const external = [...document.querySelectorAll("script[src],link[rel=stylesheet],img[src]")]
    .map(el => el.getAttribute("src") || el.getAttribute("href") || "");
  const foreign = external.filter(src => !/^https:\/\/mc\.yandex\.ru\//.test(src));
  check(foreign.length === 0, `${file}: найдена посторонняя внешняя зависимость: ${foreign.join(", ")}`);
  check(typeof dom.window.ym === "function", `${file}: счётчик Метрики не инициализирован`);

  const canonical = document.querySelector('link[rel=canonical]')?.getAttribute("href") ?? "";
  const expected = file === "index.html" ? "https://macos2024.github.io/" : `https://macos2024.github.io/${file}`;
  check(canonical === expected, `${file}: canonical «${canonical}», ожидался «${expected}»`);
  check(Boolean(document.querySelector('meta[property="og:title"]')?.content.trim()), `${file}: нет og:title`);
  check(document.querySelector('meta[property="og:image"]')?.content === "https://macos2024.github.io/og-image.png", `${file}: нет og:image по абсолютному URL`);
  check(document.querySelector('meta[name="twitter:card"]')?.content === "summary_large_image", `${file}: twitter:card должен быть summary_large_image`);
  const titleLen = (document.querySelector("title")?.textContent ?? "").length;
  check(titleLen > 0 && titleLen <= 60, `${file}: длина title ${titleLen}, допустимо до 60 символов`);
  check(document.querySelector('meta[property="og:url"]')?.content === expected, `${file}: og:url не совпадает с canonical`);
  const ld = document.querySelector('script[type="application/ld+json"]')?.textContent ?? "";
  let ldParsed = null;
  try { ldParsed = JSON.parse(ld); } catch { /* останется null */ }
  check(ldParsed !== null, `${file}: микроразметка JSON-LD не разбирается как JSON`);
  const ldTypes = (ldParsed?.["@graph"] ?? []).map(node => node["@type"]);
  if (file === "index.html") {
    check(ldTypes.includes("WebSite") && ldTypes.includes("ItemList"), `${file}: в разметке нет WebSite и ItemList`);
  } else if (noticePages.includes(file)) {
    check(ldTypes.includes("WebPage"), `${file}: страница без калькулятора должна размечаться как WebPage`);
    check(!ldTypes.includes("WebApplication"), `${file}: страница без калькулятора не должна объявлять WebApplication`);
    check(!document.getElementById("go"), `${file}: на странице снятого калькулятора не должно быть кнопки расчёта`);
    check(!document.getElementById("res"), `${file}: на странице снятого калькулятора не должно быть блока результата`);
    check(document.querySelectorAll("input").length === 0, `${file}: на странице снятого калькулятора не должно быть полей ввода`);
    check(Boolean(document.querySelector(".rerr")), `${file}: должно быть видимое объяснение, почему расчёт снят`);
  } else {
    check(ldTypes.includes("WebApplication"), `${file}: в разметке нет WebApplication`);
    check(ldTypes.includes("FAQPage"), `${file}: в разметке нет FAQPage`);
    const faqCount = (ldParsed?.["@graph"] ?? []).find(n => n["@type"] === "FAQPage")?.mainEntity?.length ?? 0;
    const visibleFaq = document.querySelectorAll(".faq h3").length;
    check(faqCount === visibleFaq, `${file}: в разметке ${faqCount} вопросов, на странице ${visibleFaq} — они должны совпадать`);
  }
  if (file !== "index.html" && !noticePages.includes(file)) {
    check(Number.isNaN(dom.window.N("12abc")), `${file}: парсер принимает мусор после числа`);
    check(dom.window.N("1 234,5") === 1234.5, `${file}: парсер не принимает пробелы и запятую`);
    check(dom.window.N("1e-3") === 0.001, `${file}: парсер не принимает экспоненциальную запись`);
    check(Boolean(document.getElementById("pdf")), `${file}: отсутствует кнопка PDF`);
    check(Boolean(document.getElementById("printhead")), `${file}: отсутствует печатная шапка`);
  }
  for (const control of document.querySelectorAll("input,select")) {
    const hasName = Boolean(control.getAttribute("aria-label")) ||
      Boolean(control.id && document.querySelector(`label[for="${control.id}"]`)) ||
      Boolean(control.closest("label"));
    check(hasName, `${file}: поле ${control.id || control.className || control.tagName} не связано с подписью`);
  }
  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    // Ссылка на собственный домен проверяется как локальная страница; чужой
    // адрес источника (даже с .html на конце) — не файл сайта. Якорь и
    // параметры отбрасываются: «x.html#раздел» тоже ведёт на x.html.
    const own = href.match(/^https:\/\/macos2024\.github\.io\/([^?#]*)/i);
    let target = null;
    if (own) target = own[1] || "index.html";
    else if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("#")) target = href.split(/[?#]/)[0];
    if (!target || !target.endsWith(".html")) continue;
    check(fs.existsSync(path.join(sourceDir, target)), `${file}: битая ссылка ${href}`);
  }
  dom.window.close();
}

// P2-2: поиск. Проверяем реальные множества найденных карточек, а не только
// факт появления хотя бы одного результата.
{
  kind = "functional";
  const dom = await load("index.html");
  const { document, Event } = dom.window;
  const q = document.getElementById("q");
  const search = value => {
    q.value = value;
    q.dispatchEvent(new Event("input", { bubbles: true }));
    return [...document.querySelectorAll(".ccard")]
      .filter(node => node.style.display !== "none")
      .map(node => node.getAttribute("href"))
      .sort();
  };
  const cableA = search("кабель сечение");
  const cableB = search("сечение кабеля");
  check(cableA.length > 0, "Поиск «кабель сечение» ничего не нашёл");
  check(JSON.stringify(cableA) === JSON.stringify(cableB), "Порядок слов или форма «кабеля» меняют результаты поиска");
  const breakerA = search("автоматический выключатель");
  const breakerB = search("выключатель автоматический");
  check(breakerA.length > 0, "Поиск «автоматический выключатель» ничего не нашёл");
  check(JSON.stringify(breakerA) === JSON.stringify(breakerB), "Порядок слов меняет результаты поиска автомата");
  check(JSON.stringify(search("ТЁПЛЫЙ")) === JSON.stringify(search("теплый")), "Поиск не нормализует регистр или ё/е");
  dom.window.close();
}

await calculate("zakon-oma.html", { u: "12", i: "", r: "6", p: "" }, ["Ток I2 А", "Мощность P24 Вт"]);
await calculate("moshchnost-toka.html", { i: "10" }, ["Активная мощность P2200 Вт", "Реактивная мощность Q0 вар"]);
await calculate("tok-po-moshchnosti.html", { p: "3500" }, ["Ток I15,9 А"]);

{
  recordScenario("soedinenie-rezistorov.html");
  const dom = await load("soedinenie-rezistorov.html");
  const inputs = [...dom.window.document.querySelectorAll(".rv")];
  [100, 200, 300].forEach((value, index) => { inputs[index].value = String(value); });
  dom.window.document.getElementById("go").click();
  const result = dom.window.document.getElementById("res").textContent.replace(/\s+/g, "");
  check(result.includes("54,55Ом"), `soedinenie-rezistorov.html: неверный результат «${result}»`);
  dom.window.close();
}

await calculate("delitel-napryazheniya.html", { uin: "12", r1: "1", r2: "2" }, ["Выходное напряжение Uвых8 В"]);

{
  recordScenario("markirovka-rezistorov.html");
  const dom = await load("markirovka-rezistorov.html");
  setValues(dom.window.document, { nb: 4, b1: 1, b2: 0, bm: 2, bt: 0 });
  dom.window.document.getElementById("go").click();
  const result = dom.window.document.getElementById("res").textContent.replace(/\s+/g, " ");
  check(result.includes("1 кОм"), `markirovka-rezistorov.html: неверный результат «${result}»`);
  dom.window.close();
}

await calculate("sechenie-kabelya.html", { p: "3,5" }, ["Расчётный ток15,9 А", "Предварительный кандидат1,5 мм²", "Скорректированный допустимый ток Iz19 А"]);
await calculate("sechenie-kabelya.html", { znaju: "i", i: "25", mat: "al", pr: "open", kt: "0,9", kg: "0,8" }, ["Расчётный ток25 А", "Предварительный кандидат6 мм²", "Скорректированный допустимый ток Iz28,08 А"]);
// Независимый эталон ПУЭ 1.3.4/1.3.5. Эти значения намеренно перечислены
// отдельно от JS страницы: тест не копирует массив из калькулятора.
const pueCurrentFixtures = [
  { name: "Cu/open", mat: "cu", faza: "1", pr: "open", rows: [[1.5,23],[2.5,30],[4,41],[6,50],[10,80],[16,100],[25,140],[35,170]] },
  { name: "Cu/pipe2", mat: "cu", faza: "1", pr: "pipe2", rows: [[1.5,19],[2.5,27],[4,38],[6,46],[10,70],[16,85],[25,115],[35,135]] },
  { name: "Cu/pipe3", mat: "cu", faza: "3", pr: "pipe3", rows: [[1.5,17],[2.5,25],[4,35],[6,42],[10,60],[16,80],[25,100],[35,125]] },
  { name: "Al/open", mat: "al", faza: "1", pr: "open", rows: [[2.5,24],[4,32],[6,39],[10,60],[16,75],[25,105],[35,130]] },
  { name: "Al/pipe2", mat: "al", faza: "1", pr: "pipe2", rows: [[2.5,20],[4,28],[6,36],[10,50],[16,60],[25,85],[35,100]] },
  { name: "Al/pipe3", mat: "al", faza: "3", pr: "pipe3", rows: [[2.5,19],[4,28],[6,32],[10,47],[16,60],[25,80],[35,95]] },
];
for (const fixture of pueCurrentFixtures) {
  for (let index = 0; index < fixture.rows.length; index++) {
    const [section, current] = fixture.rows[index];
    const values = { znaju: "i", faza: fixture.faza, mat: fixture.mat, pr: fixture.pr, i: String(current) };
    const sectionText = String(section).replace('.', ',');
    await calculate("sechenie-kabelya.html", values, [
      `Предварительный кандидат${sectionText} мм²`,
      `Скорректированный допустимый ток Iz${current} А`,
    ]);

    const above = { ...values, i: String(current + 0.001) };
    const next = fixture.rows[index + 1];
    await calculate("sechenie-kabelya.html", above, next
      ? [`Предварительный кандидат${String(next[0]).replace('.', ',')} мм²`]
      : ["выходит за пределы бытовой таблицы"], "boundary");
  }
}
// Опасные регрессии: фазовый режим влияет на колонку даже при вводе тока,
// а 12 кВт в трёхфазной сети больше не получают двухпроводную строку 19 А.
await calculate("sechenie-kabelya.html", { p: "12000", p_unit: "1", faza: "3", mat: "cu", pr: "pipe3" }, ["Расчётный ток18,2 А", "Предварительный кандидат2,5 мм²", "Скорректированный допустимый ток Iz25 А"]);
await calculate("sechenie-kabelya.html", { znaju: "i", faza: "3", mat: "al", pr: "pipe3", i: "19,5" }, ["Предварительный кандидат4 мм²", "Скорректированный допустимый ток Iz28 А"]);
await calculate("sechenie-kabelya.html", { znaju: "i", faza: "3", mat: "cu", pr: "open", i: "18,5" }, ["Предварительный кандидат1,5 мм²", "Скорректированный допустимый ток Iz23 А"]);
{
  recordScenario("sechenie-kabelya.html");
  const dom = await load("sechenie-kabelya.html");
  const { document } = dom.window;
  const phase = document.getElementById("faza");
  const voltage = document.getElementById("u");
  const pipe = document.getElementById("pr").options[0];
  check(voltage.value === "220" && pipe.value === "pipe2" && pipe.textContent.includes("Два"),
    "sechenie-kabelya.html: начальная однофазная колонка не синхронизирована");
  phase.value = "3";
  phase.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  check(voltage.value === "380" && pipe.value === "pipe3" && pipe.textContent.includes("Три"),
    "sechenie-kabelya.html: смена на три фазы не обновила напряжение и колонку ПУЭ");
  phase.value = "1";
  phase.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  check(voltage.value === "220" && pipe.value === "pipe2" && pipe.textContent.includes("Два"),
    "sechenie-kabelya.html: возврат на одну фазу не восстановил колонку ПУЭ");
  dom.window.close();
}
await calculate("padenie-napryazheniya.html", { i: "10", l: "20", s: "1,5" }, ["Падение напряжения ΔU4,67 В", "2,12 %"]);
await calculate("padenie-napryazheniya.html", { i: "10", l: "20", s: "1,5", dop: "2" }, ["Сравнение с лимитомПревышает 2 %", "нужно не менее 1,59 мм²", "2,5 мм²"]);
await calculate("padenie-napryazheniya.html", { i: "50", l: "100", s: "25", mat: "al", faza: "3", u: "400", dop: "3" }, ["Падение напряжения ΔU9,7 В", "2,42 %", "Сравнение с лимитомУкладывается в 3 %"]);
await calculate("vybor-avtomata.html", { p: "3,5", iz: "19", isc: "1,5", icn: "6" }, ["Расчётный ток IB15,9 А", "Кандидат по номиналу In16 А", "15,9 ≤ 16 ≤ 19 А — выполняется", "6 ≥ 1,5 кА — выполняется", "Базовые условия выполняются"]);
await calculate("vybor-avtomata.html", { p: "3,5", iz: "19", isc: "7", icn: "6" }, ["Условие Icn ≥ Isc6 ≥ 7 кА — НЕ выполняется", "Кандидат не подходит"]);
await calculate("vybor-avtomata.html", { p: "3,5", iz: "", isc: "" }, ["СтатусНедостаточно данных"]);
await calculate("vybor-avtomata.html", { p: "3,5", iz: "19", isc: "0", icn: "6" }, ["Iz и ожидаемый ток КЗ должны быть больше нуля"], "boundary");
await calculate("vybor-uzo.html", {}, ["Номинальный ток УЗО16 А", "не более 30 мА", "Минимальный тип по форме токаA"]);
await calculate("vybor-uzo.html", { avt: "40", nz: "fire", load: "b" }, ["Номинальный ток УЗО40 А", "не более 300 мА", "Минимальный тип по форме токаB"]);
await calculate("stoimost-elektroenergii.html", { p: "1000", h: "2", d: "30", t: "5" }, ["Расход за месяц60 кВт·ч", "Стоимость в месяц300 ₽"]);
await calculate("tok-elektrodvigatelya.html", { p: "1,5" }, ["Номинальный ток3,23 А"]);
await calculate("kondensator-dvigatelya.html", { p: "1,1", u: "230", f: "50" }, ["Предварительная рабочая ёмкость76,43 мкФ", "Оценка, требуется настройка на двигателе"]);
// По умолчанию ρ совпадает с выбранным ориентиром грунта (≈50 Ом·м):
// 50 / (2 · 2,5) = 10 Ом.
await calculate("raschet-zazemleniya.html", {}, ["Оценочное сопротивление R10 Ом", "Сравнение с целью10 Ом — ниже или равно заданной цели", "СтатусОценка, требуется измерение"]);
// Граница применимости — строже источника: он говорит про 2–3 глубины
// забивки, калькулятор требует больше 4·L. Причина в направлении ошибки:
// при тесном шаге простое деление занижает сопротивление, то есть
// заземление выглядит лучше, чем есть. Ровно на границе вердикта нет.
await calculate("raschet-zazemleniya.html", { rho: "100", l: "2,5", n: "2", a: "10", rt: "30" }, ["СтатусНедостаточно данных", "в 2–3 раза"]);
await calculate("raschet-zazemleniya.html", { rho: "100", l: "2,5", n: "2", a: "10,1", rt: "30" }, ["Оценочное сопротивление R20 Ом"]);
await calculate("raschet-zazemleniya.html", { rho: "50", l: "2", n: "1", a: "1", rt: "20" }, ["Оценочное сопротивление R25 Ом", "выше заданной цели"]);
await calculate("kva-kvt.html", { v: "10", c: "0,8" }, ["10 кВА при cos φ = 0,88 кВт"]);
await calculate("rezistor-svetodioda.html", {}, ["Расчётный резистор500 Ом", "Ближайший из ряда Е24 (вверх)510 Ом"]);
await calculate("energiya-kondensatora.html", { c: "100", u: "400" }, ["Энергия E8 Дж", "Заряд Q40 мКл"]);
await calculate("reaktivnoe-soprotivlenie.html", { f: "50", c: "100", c_unit: "1e-06" }, ["Xc = 1/(2πfC)31,83 Ом"]);
await calculate("rezonans-lc.html", { f: "", l: "10", c: "100" }, ["Резонансная частота f5,033 МГц"]);
await calculate("rc-filtr.html", { r: "10", c: "10", f: "" }, ["Частота среза fc1,592 кГц"]);
await calculate("zaryad-kondensatora.html", { r: "1000", c: "1000" }, ["Постоянная времени τ = R·C1 с", "До 99%4,605 с"]);
await calculate("raschet-transformatora.html", { p2: "100", u2: "12" }, ["Сечение сердечника S12,8 см²", "Первичная обмотка W₁860 витков"]);
await calculate("raschet-radiatora.html", { pw: "30" }, ["Допустимое суммарное Rθ кристалл–среда2,333 °C/Вт", "не более 0,3333 °C/Вт", "Предварительный стационарный тепловой бюджет"]);
await calculate("raschet-radiatora.html", { pw: "15" }, ["Допустимое суммарное Rθ кристалл–среда4,667 °C/Вт", "не более 2,667 °C/Вт"]);
await calculate("raschet-radiatora.html", { pw: "40", tj: "100", ta: "40", rjc: "1,5", rcs: "0,5" }, ["Допустимое суммарное Rθ кристалл–среда1,5 °C/Вт", "Уже занято Rθjc + Rθcs2 °C/Вт", "Заданный тепловой бюджет неосуществим"]);
await calculate("vremya-raboty-akkumulyatora.html", { c: "100", p: "100" }, ["Доступная энергия600 Вт·ч", "≈ 6 ч 0 мин"]);
await calculate("soprotivlenie-provoda.html", { s: "1,5", l: "20", i: "10" }, ["233,3 мОм", "2,33 В", "23,33 Вт"]);
await calculate("ten-moshchnost-tok.html", { u: "220", p: "2" }, ["Расчётный ток I9,0909 А", "Паспортная мощность P2000 Вт", "Сопротивление R24,2 Ом"]);
await calculate("vremya-nagreva-vody.html", { v: "10", t1: "20", t2: "100", p: "2", eff: "90" }, ["Энергия из сети1,0331 кВт·ч", "31"]);
await calculate("nagrevanie-dzhoulya-lentsa.html", { i: "2", r: "10", t: "60" }, ["Мощность нагрева P40 Вт", "2,4 кДж", "0,66667 Вт·ч"]);
await calculate("delitel-toka.html", { it: "3", r1: "100", r2: "200" }, ["Ток через R₁2 А", "Ток через R₂1 А", "Напряжение на ветвях200 В"]);
await calculate("shunt-ampermetra.html", { im: "1", rm: "100", i: "10" }, ["100 мВ", "10 мОм", "0,9999 Вт"]);
await calculate("dobavochnyy-rezistor-voltmetra.html", { im: "1", rm: "100", u: "100" }, ["Добавочный резистор99,9 кОм", "Полное входное сопротивление100 кОм"]);
await calculate("awg-mm2.html", { awg: "12" }, ["12 AWG", "2,0525 мм", "3,3088 мм²"]);
await calculate("shirina-dorozhki-pcb.html", { i: "1", dt: "10", th: "35" }, ["Ширина по аппроксимации0,30039 мм"]);
await calculate("ne555-astabilnyy.html", { r1: "10", r2: "100", c: "100" }, ["68,7 Гц", "52,381 %"]);
await calculate("ne555-monostabilnyy.html", { r: "100", c: "10" }, ["1,1 с"]);
await calculate("ten-moshchnost-tok.html", { mode: "r", u: "220", r: "24,2" }, ["Мощность при введённом R2000 Вт", "Расчётный ток I9,0909 А"]);
await calculate("awg-mm2.html", { mode: "s", area: "2,5" }, ["13 AWG", "Площадь сечения2,5 мм²"]);
await calculate("shirina-dorozhki-pcb.html", { layer: "int", i: "1", dt: "10", th: "35" }, ["Ширина по аппроксимации0,78144 мм"]);
await calculate("vremya-nagreva-vody.html", { v: "10", t1: "20", t2: "110", p: "2", eff: "90" }, ["не учитывает кипение"]);
await calculate("ne555-monostabilnyy.html", { r: "-1", c: "10" }, ["должны быть больше нуля"]);

await calculate("stabilitron-rezistor.html", { vin: "12", vz: "5,1", il: "10", iz: "5" }, ["460 Ом", "103,5 мВт", "25,5 мВт"]);
await calculate("linear-regulator-loss.html", { vin: "12", vout: "5", i: "0,5", rth: "35", ta: "25" }, ["3,5 Вт", "41,667 %", "147,5 °C"]);
await calculate("pulsacii-vypryamitelya.html", { u: "12", f: "50", i: "1", c: "4700", vf: "0,8" }, ["100 Гц", "2,1277 В", "13,243 В"]);
await calculate("diode-bridge-loss.html", { u: "12", i: "2", vf: "0,8" }, ["1,6 В", "15,371 В", "3,2 Вт"]);
await calculate("toroid-turns-al.html", { al: "100", l: "100" }, ["31,6228", "32 витков", "102,4 мкГн"]);
await calculate("discharge-resistor-capacitor.html", { c: "470", v0: "400", vt: "50", t: "1" }, ["61,39 кОм", "2,606 Вт", "37,6 Дж"]);
await calculate("battery-charge-time.html", { c: "100", s0: "20", s1: "100", i: "10", eff: "90", tail: "10" }, ["80 А·ч", "8 ч", "9,78 ч"]);
await calculate("liion-charge-current.html", { c: "3000", p: "1", s: "1", cr: "0,5", v: "4,2" }, ["3 А·ч", "1,5 А", "6,3 Вт"]);
await calculate("power-factor-compensation.html", { p: "10", c1: "0,7", c2: "0,95", u: "400", f: "50" }, ["6,9152 кВАр", "45,8578 мкФ"]);
await calculate("power-factor-compensation.html", { p: "10", c1: "0,7", c2: "0,95", u: "400", f: "50", conn: "star" }, ["6,9152 кВАр", "137,574 мкФ"]);
await calculate("voltage-stabilizer-size.html", { p: "5", pf: "0,8", start: "0", reserve: "25", u: "220" }, ["7,8125 кВА", "35,5114 А"]);
await calculate("generator-sizing.html", { run: "4", start: "2", reserve: "25", pf: "0,8" }, ["6 кВт", "7,5 кВт", "9,375 кВА"]);
await calculate("power-bank-runtime.html", { c: "20000", vc: "3,7", vo: "5", i: "2", eff: "85" }, ["74 Вт·ч", "62,9 Вт·ч", "6,29 ч"]);
await calculate("solar-panel-energy.html", { p: "1", psh: "4", eff: "80" }, ["3,2 кВт·ч", "97,4 кВт·ч", "1168,8 кВт·ч"]);
await calculate("power-energy-units.html", { pv: "10", pu: "kw" }, ["10000 Вт", "13,59622 л.с.", "13,41022 hp"]);
await calculate("lm317-resistor.html", { r1: "240", v: "5", iadj: "50" }, ["713,2 Ом", "5 В"]);

await calculate("toroid-turns-al.html", { mode: "l", al: "100", n: "32" }, ["102,4 мкГн"]);
await calculate("power-energy-units.html", { mode: "energy", ev: "1", eu: "kwh" }, ["3600000 Дж", "3,6 МДж", "1000 Вт·ч"]);
await calculate("lm317-resistor.html", { mode: "vout", r1: "240", r2: "720", iadj: "50" }, ["5,036 В", "5,208 мА"]);
await calculate("power-factor-compensation.html", { p: "10", c1: "0,95", c2: "0,7" }, ["исходный < cos φ целевой"]);

// Калькуляторы 51–80
await calculate("soedinenie-kondensatorov.html", { mode: "par", c1: "100", c2: "200", c3: "300" }, ["Общая ёмкость C600 мкФ"]);
await calculate("soedinenie-kondensatorov.html", { mode: "ser", c1: "100", c2: "200", c3: "300" }, ["Общая ёмкость C54,55 мкФ"]);
await calculate("soedinenie-katushek.html", { mode: "ser", l1: "10", l2: "20", l3: "30" }, ["Общая индуктивность L60 мГн"]);
await calculate("soedinenie-katushek.html", { mode: "par", l1: "10", l2: "20", l3: "30" }, ["Общая индуктивность L5,455 мГн"]);
await calculate("zvezda-treugolnik.html", { mode: "star", ul: "380", z: "10", cos: "1" }, ["Фазное напряжение Uф219,39 В", "Активная мощность P14,44 кВт"]);
await calculate("zvezda-treugolnik.html", { mode: "delta", ul: "380", z: "10", cos: "1" }, ["Линейный ток Iл65,818 А", "Активная мощность P43,32 кВт"]);
await calculate("temperaturnyy-koefficient.html", { r20: "10", mat: "0.00393", t: "80" }, ["Сопротивление при 80 °C12,36 Ом"]);
await calculate("rms-amplituda.html", { mode: "rms", v: "220" }, ["Амплитудное (пиковое)311,13", "Среднее за полупериод198,07"]);
await calculate("decibel.html", { kind: "v", mode: "db", v1: "1", v2: "2" }, ["Уровень6,0206 дБ"]);
await calculate("decibel.html", { kind: "p", mode: "db", v1: "1", v2: "2" }, ["Уровень3,0103 дБ"]);
await calculate("most-uitstona.html", { mode: "bal", r1: "1000", r2: "2000", r3: "500" }, ["Неизвестное сопротивление Rx1 кОм"]);
await calculate("impedans-rlc.html", { r: "10", l: "10", c: "100", f: "50", u: "220" }, ["Полное сопротивление Z30,38 Ом", "Ток I7,241 А"]);
// P0-1: расчёт тока КЗ проверяется по фикстурам с эталонами, посчитанными
// вручную. Обязательный контрпример аудита (220 В / 1,2 Ом / C16) не должен
// давать положительный вердикт.
{
  const fx = JSON.parse(fs.readFileSync(path.join(testDir, "fixtures", "tok-korotkogo-zamykaniya.json"), "utf8"));
  const page = `${fx.slug}.html`;
  for (const kase of fx.cases) {
    recordScenario(page);
    kind = /Граница|граница/.test(kase.name) ? "boundary" : "functional";
    const dom = await load(page);
    const { document } = dom.window;
    setValues(document, kase.inputs);
    document.getElementById("go").click();
    const result = document.getElementById("res").textContent.replace(/\s+/g, " ").trim();
    for (const fragment of kase.expect) {
      check(result.includes(fragment), `${page} [${kase.name}]: ожидалось «${fragment}», получено «${result}»`);
    }
    for (const fragment of kase.reject ?? []) {
      check(!result.includes(fragment), `${page} [${kase.name}]: в результате не должно быть «${fragment}»`);
    }
    check(!/NaN|Infinity|undefined/.test(result), `${page} [${kase.name}]: в результате NaN/Infinity/undefined`);
    dom.window.close();
  }
  for (const kase of fx.invalid) {
    recordScenario(page);
    kind = "boundary";
    const dom = await load(page);
    const { document } = dom.window;
    setValues(document, kase.inputs);
    document.getElementById("go").click();
    const result = document.getElementById("res").textContent.replace(/\s+/g, " ").trim();
    check(!/Статус/.test(result), `${page} [${kase.name}]: при неверном вводе не должно быть статуса, получено «${result}»`);
    check(!/NaN|Infinity/.test(result), `${page} [${kase.name}]: при неверном вводе NaN/Infinity`);
    dom.window.close();
  }
  kind = "structural";
  // Семантика: страница не должна называть УЗО заменой автомата и не должна
  // обещать конкретное время отключения.
  const html = fs.readFileSync(path.join(sourceDir, page), "utf8");
  check(!/0,1\s*с/.test(html), `${page}: обещание времени отключения «0,1 с» должно быть убрано`);
  check(/УЗО не сработает|не заменяет|обойти нельзя/.test(html), `${page}: должно быть явно сказано, что УЗО не заменяет защиту от сверхтока`);
  check(!/Радикальное решение — установить УЗО/.test(html), `${page}: УЗО не должно предлагаться как решение проблемы недостаточного тока КЗ`);
  check(/не заменяет расчёт проекта/.test(html), `${page}: должно быть видимое предупреждение об ограничениях онлайн-оценки`);
  for (const pattern of fx.must_not_contain) {
    check(!html.includes(pattern), `${page}: запрещённый режим или вердикт «${pattern}» остался на странице`);
  }
  check(html.includes("0,8 · Uф / Zпетли"), `${page}: не показана фиксированная формула конвенционального метода`);
  check(html.includes("максимальной допустимой рабочей температуре"), `${page}: не указано, что температурная поправка должна входить в Z`);
}

// P1-1: сечение PE. Границы таблицы и округление вверх; фиктивных режимов
// быть не должно, а тексты не должны обещать расчёта N.
{
  const fx = JSON.parse(fs.readFileSync(path.join(testDir, "fixtures", "sechenie-pe-provodnika.json"), "utf8"));
  const page = `${fx.slug}.html`;
  for (const kase of fx.cases) {
    recordScenario(page);
    kind = /граница|ряд|ловушка/.test(kase.name) ? "boundary" : "functional";
    const dom = await load(page);
    const { document } = dom.window;
    setValues(document, { s: kase.s, metal: kase.metal ?? "cu", layout: kase.layout ?? "together" });
    document.getElementById("go").click();
    const result = document.getElementById("res").textContent.replace(/\s+/g, " ").trim();
    for (const fragment of kase.expect) {
      check(result.includes(fragment), `${page} [${kase.name}]: ожидалось «${fragment}», получено «${result}»`);
    }
    for (const fragment of kase.reject ?? []) {
      check(!result.includes(fragment), `${page} [${kase.name}]: в результате не должно быть «${fragment}»`);
    }
    check(!/NaN|Infinity|undefined/.test(result), `${page} [${kase.name}]: NaN/Infinity/undefined в результате`);
    dom.window.close();
  }
  for (const kase of fx.invalid) {
    recordScenario(page);
    kind = "boundary";
    const dom = await load(page);
    const { document } = dom.window;
    setValues(document, { s: kase.s });
    document.getElementById("go").click();
    const result = document.getElementById("res").textContent.replace(/\s+/g, " ").trim();
    check(!/Принять по стандартному ряду/.test(result), `${page} [${kase.name}]: при неверном вводе не должно быть результата`);
    check(!/NaN|Infinity/.test(result), `${page} [${kase.name}]: NaN/Infinity при неверном вводе`);
    dom.window.close();
  }
  kind = "structural";
  const pageHtml = fs.readFileSync(path.join(sourceDir, page), "utf8");
  for (const pattern of fx.must_not_contain.patterns) {
    check(!pageHtml.includes(pattern), `${page}: текст «${pattern}» обещает то, чего расчёт не делает`);
  }
  // Два переключателя, и оба обязаны влиять на результат: материал задаёт
  // механический минимум (медь 2,5/4, алюминий 16), способ прокладки решает,
  // применяется ли минимум вообще. Переключатель без влияния — дефект.
  {
    const dom = await load(page);
    const ids = [...dom.window.document.querySelectorAll("select")].map(s => s.id).sort();
    check(ids.length === 2 && ids[0] === "layout" && ids[1] === "metal",
      `${page}: ожидаются переключатели #metal и #layout, найдено: ${ids.join(", ")}`);
    dom.window.close();
  }
  // Ключевая защита от возврата дефекта: алюминиевый PE, проложенный отдельно,
  // не может получить медные 2,5/4 мм². ПУЭ 1.7.127 требует для него 16 мм².
  for (const layout of ["separate-protected", "separate-unprotected"]) {
    recordScenario(page);
    kind = "boundary";
    const dom = await load(page);
    const { document } = dom.window;
    setValues(document, { s: "1,5", metal: "al", layout });
    document.getElementById("go").click();
    const result = document.getElementById("res").textContent.replace(/\s+/g, " ").trim();
    check(/Принять по стандартному ряду16 мм²/.test(result),
      `${page}: отдельный алюминиевый PE (${layout}) должен давать 16 мм², получено «${result}»`);
    check(!/Принять по стандартному ряду(2,5|4) мм²/.test(result),
      `${page}: к алюминию применён медный минимум — занижение сечения`);
    dom.window.close();
  }
  // Вернуть вид проверок: иначе всё, что идёт дальше, посчитается граничным
  // и разбивка в отчёте перестанет отражать реальность.
  kind = "structural";
}

// P1-2: карточка источника на изменённых страницах и реестр проверки.
{
  const audited = {
    "tok-korotkogo-zamykaniya.html": [
      "Сверено с источником и тестами",
      "https://www.electrical-installation.org/enwiki/Calculation_of_minimum_levels_of_short-circuit_current",
    ],
    "sechenie-pe-provodnika.html": [
      "Сверено с источником и тестами",
      "https://www.electrical-installation.org/enwiki/Sizing_of_protective_earthing_conductor",
    ],
  };
  for (const [page, [statusLabel, sourceUrl]] of Object.entries(audited)) {
    const dom = await load(page);
    const { document } = dom.window;
    const card = document.querySelector("section.src");
    check(Boolean(card), `${page}: нет карточки источника`);
    check(card?.textContent.includes(statusLabel), `${page}: статус должен быть «${statusLabel}»`);
    check((card?.querySelectorAll("li").length ?? 0) > 0, `${page}: в карточке нет ни источников, ни ограничений`);
    check(Boolean(card?.querySelector(`a[href="${sourceUrl}"]`)), `${page}: нет точной ссылки на первоисточник`);
    check(card?.textContent.includes("Границы применимости"), `${page}: не указаны границы применимости`);
    // Фактического независимого проверяющего нельзя указывать до его проверки.
    check(!/Проверил:/.test(card?.textContent ?? ""), `${page}: независимая проверка не зафиксирована, поля «Проверил» быть не должно`);
    dom.window.close();
  }
  const registry = fs.readFileSync(path.join(sourceDir, "ENGINEERING_AUDIT.md"), "utf8");
  for (const slug of ["tok-korotkogo-zamykaniya", "sechenie-pe-provodnika", "gasyashchiy-kondensator"]) {
    check(registry.includes(slug), `ENGINEERING_AUDIT.md: нет записи о ${slug}`);
  }
}

// Карточки источников и границ применимости для 64 расчётов этого прохода.
// Статус intentionally не повышается до verified: независимого внешнего
// проверяющего не было, а оценочные модели остаются оценочными.
{
  const agentReviewed = `
    attenyuator bazovyy-rezistor-tranzistora delitel-napryazheniya delitel-toka
    discharge-resistor-capacitor dobavochnyy-rezistor-voltmetra energiya-kondensatora
    impedans-rlc koefficient-transformacii lc-filtr-raschet linear-regulator-loss
    markirovka-rezistorov moshchnost-po-schetchiku moshchnost-toka most-uitstona
    nagrevanie-dzhoulya-lentsa ne555-astabilnyy rc-filtr reaktivnoe-soprotivlenie
    rezistor-svetodioda rezonans-lc rms-amplituda shunt-ampermetra
    soedinenie-rezistorov soprotivlenie-provoda stoimost-elektroenergii
    stoimost-osveshcheniya temperaturnyy-koefficient tok-po-moshchnosti zakon-oma
    zapolnenie-truby-kabelem zaryad-kondensatora`.trim().split(/\s+/);
  const estimates = `
    batareya-posledovatelno-parallelno battery-charge-time diametr-provoda-obmotki
    diode-bridge-loss dlina-antenny drossel-impulsnogo generator-sizing
    kondensator-dvigatelya kpd-transformatora kva-kvt liion-charge-current
    moshchnost-elektrokotla moshchnost-nasosa nagruzka-kvartiry power-bank-runtime
    pulsacii-vypryamitelya raschet-akb-avtonomnoy raschet-invertora
    raschet-osveshcheniya raschet-transformatora sechenie-po-dline-12v
    shim-srednee-napryazhenie skin-effekt snabber-rc solar-panel-energy
    stabilitron-rezistor teplyy-pol tok-elektrodvigatelya umnozhitel-napryazheniya
    voltage-stabilizer-size vremya-raboty-akkumulyatora zaryadka-elektromobilya`.trim().split(/\s+/);
  check(agentReviewed.length === 32 && estimates.length === 32,
    "Реестр прохода должен содержать ровно 32 agent-reviewed и 32 estimate");
  const registry = fs.readFileSync(path.join(sourceDir, "ENGINEERING_AUDIT.md"), "utf8");
  for (const [status, slugs] of [["Сверено с источником и тестами", agentReviewed], ["Оценка, не нормативный вердикт", estimates]]) {
    for (const slug of slugs) {
      const page = `${slug}.html`;
      const dom = await load(page);
      const card = dom.window.document.querySelector("section.src");
      check(Boolean(card), `${page}: нет карточки инженерного аудита`);
      check(card?.textContent.includes(status), `${page}: неверный статус карточки`);
      check((card?.querySelectorAll('a[href^="https://"]').length ?? 0) > 0, `${page}: нет ссылки на источник`);
      check(card?.textContent.includes("Редакция"), `${page}: не указана редакция источника`);
      check(card?.textContent.includes("Границы применимости"), `${page}: не указаны ограничения`);
      check(!/Проверил:/.test(card?.textContent ?? ""), `${page}: выдуман независимый проверяющий`);
      check(registry.includes(`\`${slug}\``), `ENGINEERING_AUDIT.md: нет записи о ${slug}`);
      dom.window.close();
    }
  }
}

// Финальный проход: карточки источников и границ применимости для последних
// 22 работающих расчётов. Статус verified не используется без внешнего
// инженера-проверяющего; оценки не превращаются в нормативные вердикты.
{
  const agentReviewed = `
    awg-mm2 decibel lm317-resistor ne555-monostabilnyy ou-usilenie
    power-energy-units preobrazovanie-y-delta soedinenie-katushek
    soedinenie-kondensatorov ten-moshchnost-tok zvezda-treugolnik
  `.trim().split(/\s+/);
  const estimates = `
    buck-boost-duty induktivnost-katushki ntc-termistor perevod-ah-wh
    power-factor-compensation shirina-dorozhki-pcb solnechnye-paneli-massiv
    tok-v-nule-perekos toroid-turns-al vnutrennee-soprotivlenie
    vremya-nagreva-vody
  `.trim().split(/\s+/);
  check(agentReviewed.length === 11 && estimates.length === 11,
    "Финальный реестр должен содержать 11 agent-reviewed и 11 estimate");
  const registry = fs.readFileSync(path.join(sourceDir, "ENGINEERING_AUDIT.md"), "utf8");
  for (const [status, slugs] of [["Сверено с источником и тестами", agentReviewed], ["Оценка, не нормативный вердикт", estimates]]) {
    for (const slug of slugs) {
      const page = `${slug}.html`;
      const dom = await load(page);
      const card = dom.window.document.querySelector("section.src");
      check(Boolean(card), `${page}: нет карточки финального инженерного прохода`);
      check(card?.textContent.includes(status), `${page}: неверный финальный статус карточки`);
      check((card?.querySelectorAll('a[href^="https://"]').length ?? 0) > 0, `${page}: нет ссылки на источник`);
      check(card?.textContent.includes("Редакция"), `${page}: не указана редакция источника`);
      check(card?.textContent.includes("Границы применимости"), `${page}: не указаны ограничения`);
      check(!/Проверил:/.test(card?.textContent ?? ""), `${page}: выдуман независимый проверяющий`);
      check(registry.includes(`\`${slug}\``), `ENGINEERING_AUDIT.md: нет записи о ${slug}`);
      dom.window.close();
    }
  }
}
await calculate("dlina-kabelya-po-padeniyu.html", { i: "16", s: "2,5", u: "220", dop: "5" }, ["Максимальная длина линии49,107 м"]);
await calculate("dlina-kabelya-po-padeniyu.html", { i: "25", s: "16", mat: "0.028", u: "400", dop: "3", faza: "3" }, ["Допустимое падение12 В (3 %)", "Максимальная длина линии158,36 м", "Оценка по активному сопротивлению при 20 °C"]);
await calculate("moshchnost-po-schetchiku.html", { k: "3200", n: "10", t: "30", tar: "5" }, ["Мощность нагрузки375 Вт"]);
await calculate("nagruzka-kvartiry.html", { p: "15", kc: "0,5", u: "220", cos: "1" }, ["Расчётный ток34,091 А", "Статус выбора защитыНедостаточно данных"]);
await calculate("zapolnenie-truby-kabelem.html", { d: "25", n: "3", dk: "7" }, ["Коэффициент заполнения23,52 %", "Максимум кабелей этого диаметра5 шт."]);
await calculate("teplyy-pol.html", { s: "10", pud: "150", ppog: "20", u: "220" }, ["Длина греющего кабеля75 м", "Шаг укладки13,3 см"]);
await calculate("sechenie-po-dline-12v.html", { i: "10", l: "5", u: "12", dop: "3" }, ["Расчётное сечение4,861 мм²", "Ближайшее стандартное6 мм²"]);
await calculate("batareya-posledovatelno-parallelno.html", { uc: "3,2", cc: "100", ns: "4", np: "2" }, ["Напряжение батареи12,8 В", "Ёмкость батареи200 А·ч"]);
await calculate("perevod-ah-wh.html", { mode: "wh", ah: "100", u: "12" }, ["Энергия1200 Вт·ч"]);
await calculate("perevod-ah-wh.html", { mode: "ah", wh: "1200", u: "12" }, ["Ёмкость100 А·ч"]);
await calculate("zaryadka-elektromobilya.html", { c: "60", s0: "20", s1: "80", p: "7,4", eff: "90", tar: "5" }, ["Взять из сети с учётом КПД40 кВт·ч", "Стоимость зарядки200 ₽"]);
await calculate("moshchnost-nasosa.html", { q: "5", h: "30", ro: "1000", np: "65", nm: "90", u: "220", cos: "0,8" }, ["Гидравлическая мощность408,8 Вт", "Потребляемая из сети698,7 Вт"]);
await calculate("raschet-akb-avtonomnoy.html", { e: "3", d: "2", u: "48", dod: "80", eff: "90" }, ["Требуемая ёмкость173,61 А·ч"]);
await calculate("ou-usilenie.html", { mode: "inv", rin: "1", rf: "10", vin: "0,1", vmin: "-12", vmax: "12" }, ["Коэффициент усиления-10", "Усиление в децибелах20 дБ"]);
await calculate("ou-usilenie.html", { mode: "non", rin: "1", rf: "10", vin: "0,1", vmin: "0", vmax: "12" }, ["Коэффициент усиления11"]);
await calculate("ou-usilenie.html", { mode: "inv", rin: "1", rf: "10", vin: "0,1", vmin: "0", vmax: "12" }, ["Выходное напряжение-1 В", "вне введённого допустимого диапазона 0…12 В"]);
await calculate("bazovyy-rezistor-tranzistora.html", { vc: "5", vbe: "0,7", ic: "100", beta: "10" }, ["Заданный принудительный β10", "Расчётный резистор Rб430 Ом", "Ближайший из ряда Е24 (вниз)430 Ом"]);
await calculate("buck-boost-duty.html", { mode: "buck", vin: "12", vout: "5", f: "100" }, ["Коэффициент заполнения D0,41667"]);
await calculate("buck-boost-duty.html", { mode: "boost", vin: "5", vout: "12", f: "100" }, ["Коэффициент заполнения D0,58333"]);
await calculate("buck-boost-duty.html", { mode: "bb", vin: "5", vout: "12", f: "100" }, ["Коэффициент заполнения D0,70588", "Отношение Vout / Vin2,4"]);
await calculate("drossel-impulsnogo.html", { mode: "buck", vin: "12", vout: "5", f: "100", io: "1", ri: "30" }, ["Требуемая индуктивность L97,22 мкГн", "Пиковый ток дросселя1,15 А"]);
await calculate("shim-srednee-napryazhenie.html", { v: "12", d: "25", r: "10", f: "1" }, ["Действующее напряжение (RMS)6 В", "Мощность в нагрузке3,6 Вт"]);
await calculate("dlina-antenny.html", { mode: "dip", f: "145", k: "0,95" }, ["Полная длина диполя0,982079 м"]);
await calculate("induktivnost-katushki.html", { mode: "l", d: "20", len: "20", n: "20" }, ["Индуктивность в мкГн5,43036 мкГн"]);
await calculate("induktivnost-katushki.html", { mode: "n", d: "20", len: "20", ind: "5,43" }, ["Принять витков20 витков"]);
await calculate("ntc-termistor.html", { mode: "r", r25: "10", b: "3950", t: "50" }, ["Сопротивление термистора3,588 кОм"]);
await calculate("ntc-termistor.html", { mode: "t", r25: "10", b: "3950", r: "3,588" }, ["Температура50,001 °C"]);
await calculate("diametr-provoda-obmotki.html", { mode: "d", i: "2", j: "2,5" }, ["Расчётный диаметр1,0093 мм", "Ближайший стандартный1,06 мм"]);
await calculate("lc-filtr-raschet.html", { fc: "1000", r: "8" }, ["Индуктивность L1,801 мГн", "Ёмкость C14,07 мкФ"]);

// Проверка обработки ошибок в новых калькуляторах
await calculate("soedinenie-kondensatorov.html", { mode: "par", c1: "100", c2: "", c3: "" }, ["минимум два номинала"]);
await calculate("buck-boost-duty.html", { mode: "buck", vin: "5", vout: "12", f: "100" }, ["не может дать выход выше входа"]);
await calculate("zvezda-treugolnik.html", { mode: "star", ul: "380", z: "10", cos: "2" }, ["cos φ должен быть"]);

// Калькуляторы 81–100
await calculate("preobrazovanie-y-delta.html", { mode: "dy", rab: "10", rbc: "20", rca: "30" }, ["Ra (луч к узлу A)5 Ом", "Rc (луч к узлу C)10 Ом"]);
await calculate("preobrazovanie-y-delta.html", { mode: "yd", ra: "5", rb: "3,3333", rc: "10" }, ["R(ab) — между A и B10 Ом", "R(bc) — между B и C20 Ом"]);
await calculate("vnutrennee-soprotivlenie.html", { mode: "xx", e: "12,7", u: "11,8", i: "100" }, ["Внутреннее сопротивление r9 мОм", "Pmax линейной модели4,48 кВт", "Экстраполяция I при U=01,411 кА"]);
await calculate("vnutrennee-soprotivlenie.html", { mode: "two", u1: "12,4", i1: "30", u2: "11,8", i2: "100" }, ["Внутреннее сопротивление r8,571 мОм", "ЭДС источника12,657 В"]);
await calculate("koefficient-transformacii.html", { u1: "220", u2: "12", n1: "1100", i2: "5", eff: "100" }, ["Коэффициент трансформации n18,3333", "Число витков вторичной W₂60 витков"]);
await calculate("koefficienty-prokladki.html", { it: "27", kt: "0,94", kg: "0,85", ko: "1" }, ["Суммарный коэффициент0,799", "Допустимый ток с поправками21,573 А"]);
await calculate("koefficienty-prokladki.html", { it: "100", kt: "0,9", kg: "0,8", ko: "0,95" }, ["Суммарный коэффициент0,684", "Допустимый ток с поправками68,4 А", "Потеря от табличного31,6 %"]);
await calculate("raschet-osveshcheniya.html", { e: "150", s: "18", fl: "1200", eta: "0,5", kz: "1,2", z: "1,1" }, ["Требуемый полезный поток3564 лм", "Принять светильников6 шт."]);
await calculate("emkostnyy-tok-utechki.html", { i: "25", l: "80", uzo: "30" }, ["Суммарный ток утечки10,8 мА", "Условие ПУЭ 7.1.83Не выполняется по оценке"]);
await calculate("emkostnyy-tok-utechki.html", { i: "10", l: "50", uzo: "30" }, ["Суммарный ток утечки4,5 мА", "Условие ПУЭ 7.1.83Выполняется по оценке"]);
await calculate("tok-v-nule-perekos.html", { ia: "30", ib: "20", ic: "10", u: "220" }, ["Ток основной гармоники I(N)17,321 А", "не предназначена для выбора сечения"]);
await calculate("tok-v-nule-perekos.html", { ia: "20", ib: "20", ic: "20", u: "220" }, ["Ток основной гармоники I(N)0 А", "тройные гармоники"]);
await calculate("prosadka-pri-puske.html", { i: "10", k: "6", l: "30", s: "4", u: "220", c: "0,35", x: "0,08", lim: "15" }, ["Пусковой ток60 А", "Провал на кабеле7,7353 В", "Суммарный расчётный провал7,7353 В (3,516 %)", "Сравнение с заданным пределомУкладывается", "СтатусОценка, не гарантия пуска"]);
// Schneider Figure G30 / Example 1: Cu 35 мм², 50 м, 500 А, 3 фазы,
// cos φ=0,35 -> около 13,5 В на кабеле; вместе с 14 В сверху -> 27,5 В.
await calculate("prosadka-pri-puske.html", { i: "100", k: "5", l: "50", s: "35", faza: "3", u: "400", c: "0,35", x: "0,08", up: "14", lim: "7" }, ["Пусковой ток500 А", "Расчётный коэффициент линии0,5403 В/(А·км)", "Провал на кабеле13,507 В", "Суммарный расчётный провал27,507 В (6,877 %)", "Сравнение с заданным пределомУкладывается"]);
await calculate("prosadka-pri-puske.html", { i: "10", k: "6", l: "30", s: "4", mat: "al", c: "0,35", x: "0,08", u: "220", up: "0", lim: "10" }, ["Сопротивление проводника R9,4 Ом/км", "Провал на кабеле12,114 В", "Суммарный расчётный провал12,114 В (5,506 %)"]);
// 70% напряжения должны означать 49% именно полновольтного пускового момента.
await calculate("prosadka-pri-puske.html", { i: "1", k: "1", l: "1000", s: "23,7", mat: "cu", c: "1", x: "0", u: "220", up: "64", lim: "31" }, ["Суммарный расчётный провал66 В (30 %)", "Напряжение на двигателе при пуске154 В", "около 49 % от полновольтного пускового момента"]);
await calculate("prosadka-pri-puske.html", { i: "1", k: "1", l: "1000", s: "23,7", mat: "cu", c: "1", x: "0", u: "220", up: "217", lim: "99,9" }, ["Суммарный расчётный провал219 В (99,55 %)", "Напряжение на двигателе при пуске1 В", "около 0,002066 % от полновольтного пускового момента"]);
for (const up of ["218", "219"]) {
  recordScenario("prosadka-pri-puske.html");
  const dom = await load("prosadka-pri-puske.html");
  setValues(dom.window.document, { i: "1", k: "1", l: "1000", s: "23,7", c: "1", x: "0", u: "220", up, lim: "15" });
  dom.window.document.getElementById("go").click();
  const result = dom.window.document.getElementById("res").textContent.replace(/\s+/g, " ");
  check(result.includes("Модель вне области применимости; пуск не подтверждён"), `prosadka-pri-puske.html: ΔU≥U не заблокировано при upstream=${up}`);
  check(result.includes("Сравнение с заданным пределомНе применяется"), `prosadka-pri-puske.html: при ΔU≥U остался обычный вердикт`);
  check(!result.includes("Напряжение на двигателе при пуске"), `prosadka-pri-puske.html: при ΔU≥U показано фиктивное напряжение`);
  check(!result.includes("пускового момента"), `prosadka-pri-puske.html: при ΔU≥U показан фиктивный момент`);
  check(!/NaN|Infinity|−|-\d/.test(result), `prosadka-pri-puske.html: при ΔU≥U появился нефизичный результат «${result}»`);
  dom.window.close();
}
{
  recordScenario("prosadka-pri-puske.html");
  const dom = await load("prosadka-pri-puske.html");
  const phase = dom.window.document.getElementById("faza");
  const voltage = dom.window.document.getElementById("u");
  check(voltage.value === "220", "prosadka-pri-puske.html: неверное начальное напряжение");
  phase.value = "3";
  phase.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  check(voltage.value === "380", "prosadka-pri-puske.html: три фазы не установили 380 В");
  phase.value = "1";
  phase.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  check(voltage.value === "220", "prosadka-pri-puske.html: одна фаза не восстановила 220 В");
  dom.window.close();
}
await calculate("prosadka-pri-puske.html", { c: "0" }, ["Пусковой cos φ должен быть больше 0 и не больше 1"]);
await calculate("prosadka-pri-puske.html", { c: "1,01" }, ["Пусковой cos φ должен быть больше 0 и не больше 1"]);
await calculate("prosadka-pri-puske.html", { x: "-0,01" }, ["Реактивное сопротивление X не может быть отрицательным"]);
await calculate("prosadka-pri-puske.html", { up: "-1" }, ["Провал вышестоящей сети не может быть отрицательным"]);
await calculate("prosadka-pri-puske.html", { lim: "0" }, ["Допустимый провал должен быть больше 0 и меньше 100%"]);
await calculate("prosadka-pri-puske.html", { lim: "100" }, ["Допустимый провал должен быть больше 0 и меньше 100%"]);
await calculate("molniezashchita.html", { h: "12", nad: "0.99", hx: "6" }, ["Высота конуса защиты h₀9,6 м", "Радиус на высоте 6 м3,6 м"]);
await calculate("molniezashchita.html", { h: "150", nad: "0.9", hx: "0" }, ["Высота конуса защиты h₀127,5 м", "Радиус зоны у земли r₀172,5 м"]);
await calculate("molniezashchita.html", { h: "100", nad: "0.99", hx: "0" }, ["Высота конуса защиты h₀80 м", "Радиус зоны у земли r₀69,99 м"]);
await calculate("molniezashchita.html", { h: "150", nad: "0.999", hx: "0" }, ["Высота конуса защиты h₀90 м", "Радиус зоны у земли r₀60 м"]);
await calculate("moshchnost-elektrokotla.html", { v: "150", tin: "22", tout: "-25", k: "1.5", faza: "3", tar: "5" }, ["Расчётная тепловая мощность12,297 кВт", "Ток при 380 В21,485 А"]);
await calculate("raschet-invertora.html", { p: "2000", cos: "0,8", zap: "1,3", ub: "24", eff: "90", l: "2" }, ["Ток по стороне аккумулятора при номинальном напряжении92,593 А", "Следующее сечение для проверки16 мм²", "СтатусНедостаточно данных: не задано наименьшее входное напряжение инвертора. Ток и сечение посчитаны при номинальном напряжении 24 В и занижены"]);
await calculate("kpd-transformatora.html", { sn: "100", p0: "330", pk: "2270", b: "0,7", cos: "0,9" }, ["КПД при загрузке 0,797,762 %", "Оптимальная загрузка βопт0,38128"]);
await calculate("solnechnye-paneli-massiv.html", { voc: "41,5", vmp: "34,5", beta: "-0,30", tmin: "-30", vmax: "250", n: "5" }, ["Voc массива при -30 °C241,74 В", "Сравнение введённых значенийНиже введённого предела"]);
await calculate("solnechnye-paneli-massiv.html", { voc: "41,5", vmp: "34,5", beta: "-0,30", tmin: "-30", vmax: "250", n: "6" }, ["Сравнение введённых значенийПревышает введённый предел"]);
await calculate("stoimost-osveshcheniya.html", { n: "10", h: "5", years: "5", tar: "5", p1: "10", c1: "200", r1: "30000", p2: "75", c2: "30", r2: "1000" }, ["Вариант A: всего6562,5 ₽", "ВыгоднееВариант A"]);
await calculate("skin-effekt.html", { f: "100", mat: "0.0175", mu: "1", d: "1" }, ["Глубина скин-слоя δ0,21054 мм", "около 1,504 раз"]);
await calculate("snabber-rc.html", { f0: "20", cadd: "470", v: "400", fsw: "100", k: "4" }, ["Паразитная индуктивность Lпар404,2 нГн", "Резистор снаббера Rs51 Ом", "Мощность на резисторе10,03 Вт"]);
await calculate("umnozhitel-napryazheniya.html", { u: "220", n: "3", c: "1", f: "50", i: "1", vf: "1" }, ["Идеальное выходное (2n·Uм)1866,76 В", "Реальное выходное напряжение1420,76 В"]);
await calculate("attenyuator.html", { a: "6", z: "50", p: "100" }, ["Коэффициент по напряжению K1,99526", "Мощность на выходе25,12 мВт"]);

// Вторые независимые инженерные эталоны для расчётов, у которых прежде был
// только один smoke-сценарий. Значения ниже получены из ручных подстановок в
// опубликованные формулы; дополнительные строки закрывают все режимы UI.
await calculate("attenyuator.html", { a: "20", z: "75", p: "1000" }, ["Коэффициент по напряжению K10", "Мощность на выходе10 мВт"]);
await calculate("batareya-posledovatelno-parallelno.html", { uc: "3,7", cc: "2,5", ns: "3", np: "4" }, ["Напряжение батареи11,1 В", "Ёмкость батареи10 А·ч"]);
await calculate("battery-charge-time.html", { c: "50", s0: "0", s1: "50", i: "5", eff: "100", tail: "0" }, ["Нужно вернуть в аккумулятор25 А·ч", "Оценка с потерями и завершением5 ч"]);
await calculate("bazovyy-rezistor-tranzistora.html", { vc: "3,3", vbe: "0,8", ic: "20", beta: "10" }, ["Требуемый ток базы2 мА", "Расчётный резистор Rб1,25 кОм", "Ближайший из ряда Е24 (вниз)1,2 кОм"]);
await calculate("delitel-napryazheniya.html", { uin: "9", r1: "2", r2: "1" }, ["Выходное напряжение Uвых3 В"]);
await calculate("delitel-toka.html", { it: "6", r1: "200", r2: "100" }, ["Ток через R₁2 А", "Ток через R₂4 А", "Напряжение на ветвях400 В"]);
await calculate("diametr-provoda-obmotki.html", { mode: "i", d: "1", j: "2,5" }, ["Сечение по меди0,7854 мм²", "Допустимый ток при заданной J1,9635 А"]);
await calculate("diode-bridge-loss.html", { u: "10", i: "1", vf: "0,5" }, ["Падение на проводящей паре1 В", "Оценка потерь моста1 Вт"]);
await calculate("discharge-resistor-capacitor.html", { c: "100", v0: "100", vt: "36,7879441", t: "1", t_unit: "1" }, ["Сопротивление R10 кОм", "Начальная мощность1 Вт", "Запасённая энергия500 мДж"]);
await calculate("dlina-antenny.html", { mode: "gp", f: "300", k: "1" }, ["Длина излучателя0,249827 м"]);
await calculate("dlina-antenny.html", { mode: "loop", f: "300", k: "1" }, ["Периметр рамки0,999308 м"]);
await calculate("dobavochnyy-rezistor-voltmetra.html", { im: "1", rm: "100", u: "10" }, ["Добавочный резистор9,9 кОм", "Полное входное сопротивление10 кОм"]);
await calculate("drossel-impulsnogo.html", { mode: "boost", vin: "5", vout: "10", f: "100", io: "1", ri: "20" }, ["Средний ток дросселя2 А", "Требуемая индуктивность L62,5 мкГн", "Пиковый ток дросселя2,2 А"]);
await calculate("energiya-kondensatora.html", { c: "1000", u: "100" }, ["Энергия E5 Дж", "Заряд Q100 мКл"]);
await calculate("generator-sizing.html", { run: "2", start: "3", reserve: "0", pf: "1" }, ["Пиковая активная нагрузка5 кВт", "Минимум с запасом5 кВт", "Ориентир по полной мощности5 кВА"]);
await calculate("impedans-rlc.html", { r: "10", l: "", c: "", f: "50", u: "100" }, ["Полное сопротивление Z10 Ом", "Ток I10 А", "Угол сдвига фаз φ0°"]);
await calculate("koefficient-transformacii.html", { u1: "230", u2: "23", n1: "1000", i2: "2", eff: "90" }, ["Коэффициент трансформации n10", "Число витков вторичной W₂100 витков", "Ток первичной обмотки I₁222,2 мА"]);
await calculate("kondensator-dvigatelya.html", { p: "1", u: "230", f: "50" }, ["Предварительная рабочая ёмкость69,48 мкФ"]);
await calculate("kpd-transformatora.html", { sn: "10", p0: "100", pk: "100", b: "1", cos: "1" }, ["КПД при загрузке 198,039 %", "Оптимальная загрузка βопт1"]);
await calculate("kva-kvt.html", { v: "5", c: "1" }, ["5 кВА при cos φ = 15 кВт"]);
await calculate("lc-filtr-raschet.html", { fc: "2000", r: "4" }, ["Индуктивность L450,2 мкГн", "Ёмкость C14,07 мкФ", "Добротность Q0,707107"]);
await calculate("liion-charge-current.html", { c: "2000", p: "2", s: "3", cr: "1", v: "4" }, ["Ёмкость сборки4 А·ч", "Расчётный ток зарядки4 А", "Мощность у конца CC/CV48 Вт"]);
await calculate("linear-regulator-loss.html", { vin: "9", vout: "5", i: "1", rth: "10", ta: "20" }, ["Потери в стабилизаторе4 Вт", "Идеализированный КПД55,556 %", "Оценка температуры кристалла60 °C"]);
{
  recordScenario("markirovka-rezistorov.html");
  const dom = await load("markirovka-rezistorov.html");
  setValues(dom.window.document, { nb: 5, b1: 1, b2: 2, b3: 3, bm: 1, bt: 2 });
  dom.window.document.getElementById("go").click();
  const result = dom.window.document.getElementById("res").textContent.replace(/\s+/g, " ");
  check(result.includes("1,23 кОм ±1%"), `markirovka-rezistorov.html: неверный пяти-полосный эталон «${result}»`);
  dom.window.close();
}
await calculate("moshchnost-elektrokotla.html", { v: "107,5", tin: "10", tout: "0", k: "0.8", faza: "1", duty: "100", tar: "1" }, ["Расчётная тепловая мощность1 кВт", "Мощность котла с запасом 15%1,15 кВт", "Расход за сутки при загрузке 100%24 кВт·ч"]);
await calculate("moshchnost-nasosa.html", { q: "3,6", h: "10", ro: "1000", np: "100", nm: "100", u: "100", cos: "1" }, ["Гидравлическая мощность98,1 Вт", "Потребляемая из сети98,1 Вт", "Ток двигателя0,981 А"]);
await calculate("moshchnost-po-schetchiku.html", { k: "1000", n: "10", t: "36", tar: "1" }, ["Мощность нагрузки1 кВт", "Расход за сутки при такой нагрузке24 кВт·ч"]);
await calculate("moshchnost-toka.html", { faza: "3", u: "400", i: "10", c: "0,5" }, ["Активная мощность P3464 Вт", "Полная мощность S6928 ВА", "Реактивная мощность Q6000 вар"]);
await calculate("most-uitstona.html", { mode: "unbal", r1: "100", r2: "100", r3: "100", rx: "200", u: "6" }, ["Напряжение разбаланса Ud-1000 мВ", "Rx для баланса100 Ом", "Отклонение Rx от баланса100 %"]);
await calculate("nagrevanie-dzhoulya-lentsa.html", { i: "1", r: "2", t: "10" }, ["Мощность нагрева P2 Вт", "Количество теплоты Q20 Дж"]);
await calculate("nagruzka-kvartiry.html", { p: "10", kc: "0,6", u: "400", cos: "1", faza: "3" }, ["Расчётная мощность6 кВт", "Расчётный ток8,6603 А", "Статус выбора защитыНедостаточно данных"]);
await calculate("ne555-astabilnyy.html", { r1: "10", r2: "10", c: "1" }, ["Частота48,09 кГц", "Коэффициент заполнения66,667 %"]);
await calculate("power-bank-runtime.html", { c: "10000", vc: "3,6", vo: "5", i: "1", eff: "100" }, ["Энергия внутренних ячеек36 Вт·ч", "Оценка времени7,2 ч"]);
await calculate("pulsacii-vypryamitelya.html", { mode: "half", u: "10", f: "50", i: "1", c: "10000", vf: "0,5" }, ["Частота пульсаций50 Гц", "Размах пульсаций ΔVpp2 В", "Пик после диодов13,642 В"]);
await calculate("raschet-akb-avtonomnoy.html", { e: "1", d: "1", u: "10", dod: "100", eff: "100" }, ["Полная энергоёмкость банка1 кВт·ч", "Требуемая ёмкость100 А·ч при 10 В"]);
await calculate("raschet-invertora.html", { p: "1000", cos: "1", zap: "1", ub: "100", eff: "100", l: "1", drop: "1" }, ["Ток по стороне аккумулятора при номинальном напряжении10 А", "Минимум только по падению напряжения0,35 мм²", "Фактические потери в кабеле875 мВт"]);
// raschet-invertora: ток батареи по наименьшему входному напряжению инвертора — из баланса мощности P = η·U·I:
// при той же мощности ток обратно пропорционален напряжению (Victron, Wiring Unlimited). NEC 710.12 — только для
// сравнения: формулировка видна лишь в выдаче поиска (десятый отзыв бота). Эталоны посчитаны отдельно:
// I = P/(η·U), S = 2·0,0175·L·I/ΔU, ΔU = Uном·падение/100.
// 2000 Вт, η 0,9, 24 В → 92,593 А; при 20 В → 111,11 А; ΔU = 0,48 В; S = 0,07·111,11/0,48 = 16,204 мм² → 25 мм²;
// падение 0,07·111,11/25 = 0,31111 В (1,2963 % от 24 В); потери 0,31111·111,11 = 34,568 Вт.
await calculate("raschet-invertora.html", { p: "2000", cos: "0,8", zap: "1,3", ub: "24", umin: "20", eff: "90", l: "2" }, ["Ток по стороне аккумулятора при номинальном напряжении92,593 А", "Наибольший ток — при наименьшем входном напряжении111,11 А", "Минимум только по падению напряжения16,2 мм²", "Следующее сечение для проверки25 мм²", "Фактическое падение с принятым сечением при наибольшем токе0,3111 В (1,296 % от номинального)", "Фактические потери в кабеле при наибольшем токе34,57 Вт", "СтатусОценка: наибольший ток 111,11 А — при наименьшем входном напряжении 20 В; при номинальном 24 В ток 92,593 А"]);
// 1000 Вт, η 1, 100 В → 10 А; при 50 В → 20 А; ΔU = 1 В; S = 0,035·20/1 = 0,7 мм² → 4 мм²; падение 0,035·20/4 = 0,175 В; потери 3,5 Вт.
await calculate("raschet-invertora.html", { p: "1000", cos: "1", zap: "1", ub: "100", umin: "50", eff: "100", l: "1", drop: "1" }, ["Наибольший ток — при наименьшем входном напряжении20 А", "Минимум только по падению напряжения0,7 мм²", "Фактическое падение с принятым сечением при наибольшем токе0,175 В (0,175 % от номинального)", "Фактические потери в кабеле при наибольшем токе3,5 Вт"]);
// Граница: Uмин = Uном — наибольший ток равен номинальному (92,593 А), сечение 13,5 → 16 мм²; Uмин чуть выше Uном — ошибка ввода.
await calculate("raschet-invertora.html", { p: "2000", cos: "0,8", zap: "1,3", ub: "24", umin: "24", eff: "90", l: "2" }, ["Наибольший ток — при наименьшем входном напряжении92,593 А", "Минимум только по падению напряжения13,5 мм²", "СтатусОценка: наибольший ток 92,593 А — при наименьшем входном напряжении 24 В; при номинальном 24 В ток 92,593 А"], "boundary");
await calculate("raschet-invertora.html", { p: "2000", cos: "0,8", zap: "1,3", ub: "24", umin: "23,99", eff: "90", l: "2" }, ["Наибольший ток — при наименьшем входном напряжении92,631 А", "Минимум только по падению напряжения13,51 мм²"], "boundary");
// Десятый отзыв бота (P1): основание расчёта — баланс мощности, а не непроверенная формулировка NEC.
{
  kind = "structural";
  const invHtml = fs.readFileSync(path.join(sourceDir, "raschet-invertora.html"), "utf8");
  check(invHtml.includes("P = КПД · U · Iбат") && invHtml.includes("Это следует из баланса мощности"),
    "raschet-invertora: нет вывода тока из баланса мощности");
  check(invHtml.includes("только для сравнения") && invHtml.includes("Текст NFPA 70 мы не открывали"),
    "raschet-invertora: NEC не помечен как непроверенная справка только для сравнения");
  check(!invHtml.includes("Расчётный входной ток автономного инвертора по NEC") && !invHtml.includes("690.8(A)(4)") && !invHtml.includes("NFPA 70-2023"),
    "raschet-invertora: осталась ссылка на NEC как на основание расчёта");
}
await calculate("raschet-invertora.html", { p: "2000", cos: "0,8", zap: "1,3", ub: "24", umin: "20", eff: "90", l: "2" }, ["Ток — из баланса мощности: от батареи инвертор берёт P/КПД = U·I", "кабель и предохранитель на сам инвертор считают по его номинальной мощности"]);
await invalid("raschet-invertora.html", { ub: "24", umin: "24,01" }, "Наименьшее входное напряжение инвертора не может быть выше номинального напряжения батареи.");
await invalid("raschet-invertora.html", { umin: "0" }, "Наименьшее входное напряжение инвертора должно быть больше нуля.");
await invalid("raschet-invertora.html", { umin: "-20" }, "Наименьшее входное напряжение инвертора должно быть больше нуля.");
await invalid("raschet-invertora.html", { umin: "двадцать" }, "Наименьшее входное напряжение инвертора — число в вольтах или пустое поле.");
await calculate("raschet-osveshcheniya.html", { e: "50", s: "10", fl: "500", eta: "1", kz: "1", z: "1" }, ["Требуемый полезный поток500 лм", "Принять светильников1 шт."]);
await calculate("raschet-transformatora.html", { p2: "25", u1: "100", u2: "10", eta: "1", ks: "1,2", kw: "50" }, ["Сечение сердечника S6 см²", "Первичная обмотка W₁833 витков", "Вторичная обмотка W₂88 витков"]);
await calculate("rc-filtr.html", { r: "", c: "1", c_unit: "1e-06", f: "159,154943" }, ["Сопротивление R1 кОм"]);
await calculate("rc-filtr.html", { r: "1", c: "", f: "159,154943" }, ["Ёмкость C1 мкФ"]);
await calculate("reaktivnoe-soprotivlenie.html", { mode: "l", f: "50", l: "1000", c: "" }, ["XL = 2πfL314,2 Ом"]);
await calculate("rezistor-svetodioda.html", { u: "5", tip: "0", uf: "2", n: "1", i: "10" }, ["Расчётный резистор300 Ом", "Ближайший из ряда Е24 (вверх)300 Ом"]);
await calculate("rezonans-lc.html", { f: "1000", f_unit: "1", l: "", c: "1", c_unit: "1e-06" }, ["Индуктивность L25,33 мГн"]);
await calculate("rezonans-lc.html", { f: "1000", f_unit: "1", l: "25,330296", l_unit: "0.001", c: "" }, ["Ёмкость C1000 нФ"]);
await calculate("rms-amplituda.html", { mode: "peak", v: "10" }, ["Действующее (RMS)7,0711", "Размах (peak-to-peak)20"]);
await calculate("rms-amplituda.html", { mode: "pp", v: "20" }, ["Амплитудное (пиковое)10", "Действующее (RMS)7,0711"]);
await calculate("sechenie-po-dline-12v.html", { i: "1", l: "1", u: "10", dop: "3" }, ["Расчётное сечение0,1167 мм²", "Ближайшее стандартное0,5 мм²"]);
await calculate("shim-srednee-napryazhenie.html", { v: "10", d: "100", r: "10", f: "1" }, ["Среднее напряжение10 В", "Действующее напряжение (RMS)10 В", "Мощность в нагрузке10 Вт"]);
await calculate("shunt-ampermetra.html", { im: "1", rm: "100", i: "1" }, ["Падение напряжения на шунте100 мВ", "Сопротивление шунта100,1 мОм"]);
await calculate("skin-effekt.html", { f: "25", mat: "0.0175", mu: "1", d: "1" }, ["Глубина скин-слоя δ0,42108 мм"]);
await calculate("snabber-rc.html", { f0: "20", cadd: "470", v: "200", fsw: "100", k: "4" }, ["Паразитная индуктивность Lпар404,2 нГн", "Мощность на резисторе2,507 Вт"]);
{
  recordScenario("soedinenie-rezistorov.html");
  const dom = await load("soedinenie-rezistorov.html");
  setValues(dom.window.document, { mode: "ser", runit: "1000", rv1: "1", rv2: "2", rv3: "3" });
  dom.window.document.getElementById("go").click();
  const result = dom.window.document.getElementById("res").textContent.replace(/\s+/g, " ");
  check(result.includes("6 кОм"), `soedinenie-rezistorov.html: неверный последовательный эталон «${result}»`);
  dom.window.close();
}
await calculate("solar-panel-energy.html", { p: "2", psh: "5", eff: "100" }, ["Средняя выработка в день10 кВт·ч", "За год при том же среднем PSH3652,5 кВт·ч"]);
await calculate("soprotivlenie-provoda.html", { s: "1", l: "1", i: "1" }, ["Сопротивление R (при 20 °C)17,5 мОм", "Потери мощности17,5 мВт"]);
await calculate("stabilitron-rezistor.html", { vin: "10", vz: "5", il: "5", iz: "5" }, ["Балластный резистор R500 Ом", "Мощность резистора50 мВт", "Мощность стабилитрона25 мВт"]);
await calculate("stoimost-elektroenergii.html", { p: "2000", h: "1", d: "1", t: "10" }, ["Расход за месяц2 кВт·ч", "Стоимость в месяц20 ₽"]);
await calculate("stoimost-osveshcheniya.html", { n: "1", h: "1", years: "1", tar: "0", p1: "10", c1: "100", r1: "10000", p2: "10", c2: "100", r2: "10000" }, ["Вариант A: всего100 ₽", "Вариант B: всего100 ₽", "Разница за период0 ₽"]);
await calculate("temperaturnyy-koefficient.html", { r20: "100", mat: "0.0038", t: "70" }, ["Сопротивление при 70 °C119 Ом", "Относительное изменение19 %"]);
await calculate("teplyy-pol.html", { s: "1", pud: "100", ppog: "10", u: "220" }, ["Общая мощность100 Вт", "Длина греющего кабеля10 м", "Статус выбора защитыНедостаточно данных"]);
await calculate("tok-elektrodvigatelya.html", { set: "1", p: "1", u: "100", eta: "1", c: "1" }, ["Номинальный ток10 А"]);
await calculate("tok-po-moshchnosti.html", { faza: "3", p: "6928,20323", u: "400", c: "1" }, ["Ток I10 А"]);
await calculate("umnozhitel-napryazheniya.html", { u: "100", n: "1", c: "1000", f: "50", i: "1", vf: "0" }, ["Идеальное выходное (2n·Uм)282,843 В", "Просадка под нагрузкой0,02 В"]);
await calculate("voltage-stabilizer-size.html", { phase: "3", p: "6,92820323", pf: "1", start: "0", reserve: "0", u: "400" }, ["Рекомендуемый минимум6,9282 кВА", "Расчётный линейный ток10 А"]);
await calculate("vremya-raboty-akkumulyatora.html", { c: "10", u: "10", dod: "100", p: "100" }, ["Доступная энергия100 Вт·ч", "Время работы≈ 1 ч 0 мин"]);
await calculate("zakon-oma.html", { u: "", i: "2", r: "5", p: "" }, ["Напряжение U10 В", "Мощность P20 Вт"]);
await calculate("zakon-oma.html", { u: "10", i: "", r: "", p: "20" }, ["Ток I2 А", "Сопротивление R5 Ом"]);
await calculate("zakon-oma.html", { u: "", i: "", r: "5", p: "20" }, ["Напряжение U10 В", "Ток I2 А"]);
await calculate("zakon-oma.html", { u: "10", i: "2", r: "", p: "" }, ["Сопротивление R5 Ом", "Мощность P20 Вт"]);
await calculate("zakon-oma.html", { u: "", i: "2", r: "", p: "20" }, ["Напряжение U10 В", "Сопротивление R5 Ом"]);
await calculate("zapolnenie-truby-kabelem.html", { d: "20", n: "1", dk: "10" }, ["Коэффициент заполнения25 %", "Лимит NFPA 70 (NEC) для 1 кабеля53 %", "Максимум кабелей этого диаметра1 шт."]);
await calculate("zapolnenie-truby-kabelem.html", { d: "20", n: "2", dk: "5" }, ["Коэффициент заполнения12,5 %", "Лимит NFPA 70 (NEC) для 2 кабелей31 %", "Максимум кабелей этого диаметра6 шт."]);
await calculate("zapolnenie-truby-kabelem.html", { d: "20", n: "6", dk: "5" }, ["Коэффициент заполнения37,5 %", "Максимум кабелей этого диаметра6 шт.", "Допустимо по геометрической проверке"]);
await calculate("zapolnenie-truby-kabelem.html", { d: "20", n: "7", dk: "5" }, ["Коэффициент заполнения43,75 %", "Максимум кабелей этого диаметра6 шт.", "Геометрический предел превышен"]);
await calculate("zapolnenie-truby-kabelem.html", { d: "10", n: "5", dk: "2,88" }, ["Коэффициент заполнения41,47 %", "Максимум кабелей этого диаметра5 шт.", "Применено: дробная часть расчётного количества ≥ 0,8", "Допустимо по геометрической проверке"]);
await calculate("zapolnenie-truby-kabelem.html", { d: "10", n: "5", dk: "2,9" }, ["Коэффициент заполнения42,05 %", "Максимум кабелей этого диаметра4 шт.", "Геометрический предел превышен"]);
// Шесть граничных эталонов заполнения трубы. Помечены "boundary" явно: без
// четвёртого аргумента calculate() засчитал бы их как functional, и разбивка
// в отчёте разошлась бы с тем, что заявлено в ENGINEERING_AUDIT.md.
// Дробная часть здесь ровно 0,8 в double — проверяет допуск в несколько ULP.
await calculate("zapolnenie-truby-kabelem.html", { d: "10", n: "5", dk: "2,886751345948129" }, ["Максимум кабелей этого диаметра5 шт.", "Применено: дробная часть расчётного количества ≥ 0,8", "Допустимо по геометрической проверке"], "boundary");
// А здесь отклонение ≈562 ULP — вне допуска, округление не применяется.
await calculate("zapolnenie-truby-kabelem.html", { d: "10", n: "5", dk: "2,8867513459482792" }, ["Максимум кабелей этого диаметра4 шт.", "Геометрический предел превышен"], "boundary");
await calculate("zapolnenie-truby-kabelem.html", { d: "20", n: "9007199254740992", dk: "5" }, ["целое положительное число в безопасном диапазоне"], "boundary");
await calculate("zapolnenie-truby-kabelem.html", { d: "1e308", n: "3", dk: "1" }, ["Размеры слишком велики для надёжного расчёта"], "boundary");
await calculate("zapolnenie-truby-kabelem.html", { d: "1e153", n: "1", dk: "1" }, ["слишком большое число кабелей для надёжного расчёта"], "boundary");
await calculate("zapolnenie-truby-kabelem.html", { d: "100000000", n: "3", dk: "1" }, ["Максимум кабелей этого диаметра4000000000000000 шт."], "boundary");
await calculate("zaryad-kondensatora.html", { r: "1000", c: "100", pc: "63,2120559" }, ["Постоянная времени τ = R·C100 мс", "До 63,2%100 мс"]);
await calculate("zaryadka-elektromobilya.html", { c: "100", s0: "0", s1: "100", p: "10", eff: "100", tar: "1" }, ["Взять из сети с учётом КПД100 кВт·ч", "Время зарядки10 ч", "Стоимость зарядки100 ₽"]);

// Обработка ошибок в новых калькуляторах
await calculate("molniezashchita.html", { h: "12", nad: "0.99", hx: "10" }, ["не защищён"]);
await calculate("molniezashchita.html", { h: "151", nad: "0.99", hx: "10" }, ["до 150 м"]);
await calculate("vnutrennee-soprotivlenie.html", { mode: "xx", e: "12", u: "12,5", i: "10" }, ["должно быть меньше напряжения холостого хода"]);
await calculate("solnechnye-paneli-massiv.html", { voc: "41,5", vmp: "34,5", beta: "0,30", tmin: "-30", vmax: "250", n: "5" }, ["должен быть отрицательным"]);

{
  const dom = await load("zakon-oma.html");
  setValues(dom.window.document, { u: "12abc", r: "6" });
  dom.window.document.getElementById("go").click();
  const result = dom.window.document.getElementById("res").textContent;
  check(result.includes("Заполните ровно два поля"), "Числовой ввод принимает мусор после числа (например, 12abc)");
  dom.window.close();
}

// Доступность таблиц. Без scope скринридер не связывает ячейку с заголовком
// столбца и читает таблицу сечений как плоский поток чисел. Атрибут ставится
// генератором безусловно, а это верно только пока <th> встречается лишь в
// первой строке: заголовок строки требовал бы scope="row". Проверяем оба
// условия — что атрибут проставлен и что допущение всё ещё выполняется.
{
  kind = "structural";
  let tablesChecked = 0;
  for (const file of htmlFiles) {
    if (noticePages.includes(file) && file !== "about.html") continue;
    const html = fs.readFileSync(path.join(sourceDir, file), "utf8");
    const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/g) || [];
    for (const table of tables) {
      tablesChecked++;
      const bare = (table.match(/<th(?![^>]*scope=)/g) || []).length;
      check(bare === 0, `${file}: ${bare} заголовков таблицы без scope`);
      const rows = table.match(/<tr>[\s\S]*?<\/tr>/g) || [];
      const lateHeader = rows.slice(1).some(r => /<th/.test(r));
      check(!lateHeader,
        `${file}: <th> вне первой строки таблицы — безусловный scope="col" стал неверным, нужен scope="row"`);
    }
  }
  check(tablesChecked >= 35, `проверено таблиц: ${tablesChecked}, ожидалось не меньше 35`);
}

// Семантика заземления. Порог «шаг > 4·L» — собственный запас проекта, и
// приписывать его Schneider нельзя: источник задаёт только однородный грунт и
// шаг в 2–3 глубины забивки. Эта ложная атрибуция возвращалась на страницу
// дважды, поэтому закреплена проверкой. Порог «четыре длины» в литературе
// есть, но в другом документе и с обратным знаком: NFPA 780 A.4.13.2.4
// называет 4L верхней границей полезности разноса, а не условием
// применимости формулы. Отдельно «4L» постоянно встречается в формуле
// одиночного стержня ln(4L/a), где a — радиус, а не расстояние.
{
  kind = "structural";
  const html = fs.readFileSync(path.join(sourceDir, "raschet-zazemleniya.html"), "utf8");
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  check(/строже, чем говорит источник|источнику не принадлежит|запас проекта/.test(text),
    "raschet-zazemleniya: порог 4·L должен быть явно назван запасом проекта, а не требованием источника");
  // Флаг i обязателен: та же фраза встречается и с заглавной в начале
  // предложения. Условие «четырёх длин» само по себе законно — так описано
  // допущение калькулятора; ловим только приписывание его источнику.
  const falseAttribution = [
    /источник\s+допускает/i,
    /указывает\s+более\s+строг/i,
    /(источник|schneider)[^.!?]{0,100}четыр(е|ёх|ех)\s+длин/i,
  ].find(re => re.test(text));
  check(!falseAttribution,
    `raschet-zazemleniya: вернулась ложная атрибуция порога 4·L источнику (${falseAttribution})`);
  check(/2[–-]3 раза|двух[- ]трёх|2 to 3/.test(text),
    "raschet-zazemleniya: на странице должно остаться, что источник говорит про 2–3 глубины забивки");
}

// Ориентир грунта и поле ρ обязаны совпадать при открытии страницы: иначе
// пользователь видит «≈50 Ом·м», а расчёт идёт по другому числу. Так было
// на двух страницах заземления; проверка общая, чтобы рассинхрон не вернулся
// и на новых страницах с тем же пресетом.
{
  kind = "structural";
  let pages = 0;
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(sourceDir, file), "utf8");
    if (!html.includes('id="grunt"') || !html.includes('id="rho"')) continue;
    pages += 1;
    const dom = await load(file);
    const { document } = dom.window;
    const preset = document.getElementById("grunt")?.value;
    const rho = document.getElementById("rho")?.value;
    check(preset === rho, `${file}: ориентир грунта ${preset} Ом·м, а в поле ρ по умолчанию ${rho}`);
    dom.window.close();
  }
  check(pages >= 2, `проверка ориентира грунта нашла ${pages} страниц, ожидалось не меньше 2`);
}

// Семантика заполнения трубы. Страница ищется по слову «гофра», а поле
// диаметра по умолчанию содержит 25 — ровно маркировку типовой гофры. Если
// не сказать, что маркировка это наружный диаметр, пользователь подставит её
// вместо внутреннего, получит заниженное заполнение и оптимистичный вердикт.
// Само число «18,3 мм» сюда возвращать нельзя: универсальной величины нет.
{
  kind = "structural";
  const html = fs.readFileSync(path.join(sourceDir, "zapolnenie-truby-kabelem.html"), "utf8");
  check(/наружный<\/b> диаметр|наружный диаметр/.test(html) && /гофр/i.test(html),
    "zapolnenie-truby-kabelem: нет предупреждения, что маркировка гофры — наружный диаметр");
  check(!/18,3/.test(html),
    "zapolnenie-truby-kabelem: вернулась неподтверждённая универсальная величина внутреннего диаметра гофры");
  check(/Note 7/.test(html) && !/Note 6/.test(html),
    "zapolnenie-truby-kabelem: правило округления ≥0,8 должно ссылаться на Chapter 9 Note 7");
}

// Единая проверка строгого ввода по всему каталогу. Это полезная boundary-
// проверка интерфейса, но она намеренно НЕ увеличивает scenarioCounts и не
// выдаётся за второй независимый инженерный эталон формулы.
const invalidInputChecked = [];
{
  kind = "boundary";
  for (const file of htmlFiles) {
    if (file === "index.html" || noticePages.includes(file)) continue;
    const dom = await load(file);
    const { document } = dom.window;
    const numericInputs = [...document.querySelectorAll('input[type="text"]')];
    if (!numericInputs.length) {
      dom.window.close();
      continue;
    }
    for (const input of numericInputs) input.value = "не-число";
    document.getElementById("go")?.click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    check(dom.__runtimeErrors.length === 0, `${file}: неправильный ввод вызывает JS-ошибку: ${dom.__runtimeErrors.join("; ")}`);
    check(Boolean(document.querySelector("#res .rerr")), `${file}: неправильный числовой ввод не показал понятную ошибку`);
    invalidInputChecked.push(file);
    dom.window.close();
  }
}
kind = "structural";

// Страница без входящих контекстных ссылок достижима только с главной, где
// вес размазан по сотне ссылок. Для поиска это сигнал «второстепенная»:
// такая страница дольше индексируется и хуже ранжируется. Единственное
// намеренное исключение — снятый расчёт: он исключён и из каталога, и из
// sitemap, и ссылаться на него из «Смотрите также» не нужно.
{
  kind = "structural";
  const withdrawn = new Set(noticePages.map(f => f.replace(/\.html$/, "")));
  const inbound = new Map();
  for (const file of htmlFiles) {
    if (file === "index.html") continue;
    inbound.set(file.replace(/\.html$/, ""), 0);
  }
  for (const file of htmlFiles) {
    if (file === "index.html") continue;
    const html = fs.readFileSync(path.join(sourceDir, file), "utf8");
    const block = html.match(/<section class="related">([\s\S]*?)<\/section>/);
    if (!block) continue;
    for (const [, href] of block[1].matchAll(/href="([^"]+)\.html"/g)) {
      if (inbound.has(href)) inbound.set(href, inbound.get(href) + 1);
    }
  }
  const orphans = [...inbound].filter(([slug, n]) => n === 0 && !withdrawn.has(slug)).map(([slug]) => slug);
  check(orphans.length === 0,
    `страницы без входящих ссылок из «Смотрите также»: ${orphans.join(", ")}`);
}

const sitemap = fs.readFileSync(path.join(sourceDir, "sitemap.xml"), "utf8");
const robots = fs.readFileSync(path.join(sourceDir, "robots.txt"), "utf8");
const sitemapPages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
check(sitemapPages.length === 152, `В sitemap должно быть 152 URL (корень + about + 150 калькуляторов), найдено ${sitemapPages.length}`);
check(!sitemap.includes("REPLACE-WITH-YOUR-ADDRESS"), "В sitemap остался адрес-заглушка");
check(robots.includes("Sitemap: https://macos2024.github.io/sitemap.xml"), "В robots.txt не активирован sitemap");

// ads.txt для РСЯ. Строка DIRECT — обязательное условие, без неё Яндекс не
// считает домен авторизованным продавцом собственной рекламы. Остальные
// строки — чужие учётные записи ре-селлеров из личного кабинета, их нельзя
// менять произвольно, поэтому проверяем только структурно необходимое.
const adsTxt = fs.readFileSync(path.join(sourceDir, "ads.txt"), "utf8");
check(/yandex\.com,\s*330023171,\s*DIRECT/.test(adsTxt), "ads.txt: нет прямой строки Яндекса (DIRECT) — без неё домен не авторизован как продавец");
check(adsTxt.trim().split("\n").length >= 8, "ads.txt: часть строк ре-селлеров пропала при пересборке");
for (const file of htmlFiles) {
  const inSitemap = sitemapPages.some(url => url.endsWith(`/${file}`) || (file === "index.html" && /\/$/.test(url)));
  if (noticePages.includes(file)) {
    check(!inSitemap, `Страница снятого калькулятора ${file} не должна быть в sitemap`);
  } else {
    check(inSitemap, `В sitemap отсутствует ${file}`);
  }
}

// ===========================================================================
// Партия №1: 15 новых калькуляторов «Проводка и защита» (data_h/i/j.py).
// Три параллельных агента, независимая перепроверка перед сборкой — детали
// в ENGINEERING_AUDIT.md. Ниже — их тестовые сценарии как есть, сведённые
// в один блок вручную при интеграции.
// ===========================================================================

// Общий хелпер для проверки реакции на неверный ввод: помимо совпадения
// фрагмента текста ошибки проверяет, что не осталось следов «Статус» и что
// не протекли NaN/Infinity/undefined.
async function invalid(file, values, fragment) {
  kind = "boundary"; recordScenario(file);
  const dom = await load(file); setValues(dom.window.document, values);
  dom.window.document.getElementById("go").click();
  const result = dom.window.document.getElementById("res").textContent.replace(/\s+/g, " ").trim();
  check(result.includes(fragment), `${file}: при неверном вводе ожидалось «${fragment}», получено «${result}»`);
  check(!/Статус/.test(result), `${file}: при неверном вводе не должно быть статуса`);
  check(!/NaN|Infinity|undefined/.test(result), `${file}: NaN/Infinity/undefined при неверном вводе`);
  dom.window.close();
}

// --- data_h.py: короб NEC 314.16, короб ПУЭ 2.1.61, дифавтомат,
// селективность УЗО, предельная длина по срабатыванию ---

await calculate("zapolnenie-montazhnoy-korobki.html", {}, ["Проводники, 314.16(B)(1)8 дюйм³", "Внутренние зажимы, (B)(2)2 дюйм³", "Устройства на суппортах, (B)(4)4 дюйм³", "Заземляющие проводники, (B)(5)2 дюйм³", "Требуемый объём16 дюйм³ (262,19 см³)", "Заполнение объёма88,89 %", "Вердикт NEC 314.16Объём достаточен", "а не ПУЭ"]);
await calculate("zapolnenie-montazhnoy-korobki.html", { v: "12,5" }, ["Требуемый объём16 дюйм³", "Заполнение объёма128 %", "Вердикт NEC 314.16Объём недостаточен"]);
await calculate("zapolnenie-montazhnoy-korobki.html", { n14: "0", n12: "6", clamps: "0", yokes: "0", negc: "6", gegc: "12", v: "17" }, ["Проводники, 314.16(B)(1)13,5 дюйм³", "Заземляющие проводники, (B)(5)3,375 дюйм³", "Требуемый объём16,875 дюйм³", "Заполнение объёма99,26 %", "Объём достаточен"]);
await calculate("zapolnenie-montazhnoy-korobki.html", { n14: "0", n12: "6", clamps: "0", yokes: "0", negc: "6", gegc: "12", v: "16,8" }, ["Заполнение объёма100,4 %", "Объём недостаточен"], "boundary");
await calculate("zapolnenie-montazhnoy-korobki.html", { n14: "0", n12: "6", clamps: "0", yokes: "0", negc: "4", gegc: "12", v: "15,75" }, ["Заземляющие проводники, (B)(5)2,25 дюйм³", "Требуемый объём15,75 дюйм³", "Заполнение объёма100 %", "Объём достаточен"], "boundary");
await calculate("zapolnenie-montazhnoy-korobki.html", { n14: "2", n12: "4", clamps: "1", studs: "2", yokes: "1", ydev: "12", negc: "3", gegc: "12", v: "26,5" }, ["Проводники, 314.16(B)(1)13 дюйм³", "Внутренние зажимы, (B)(2)2,25 дюйм³", "Опорные элементы светильника, (B)(3)4,5 дюйм³", "Устройства на суппортах, (B)(4)4,5 дюйм³", "Заземляющие проводники, (B)(5)2,25 дюйм³", "Требуемый объём26,5 дюйм³", "Заполнение объёма100 %", "Объём достаточен"], "boundary");
await calculate("zapolnenie-montazhnoy-korobki.html", { n14: "2", n12: "4", clamps: "1", studs: "2", yokes: "1", ydev: "12", negc: "3", gegc: "12", v: "26,4" }, ["Заполнение объёма100,4 %", "Объём недостаточен"], "boundary");
await calculate("zapolnenie-montazhnoy-korobki.html", { n14: "2", n12: "4", clamps: "0", studs: "1", yokes: "2", ydev: "14", negc: "0", v: "30" }, ["Внутренние зажимы, (B)(2)0 дюйм³", "Опорные элементы светильника, (B)(3)2,25 дюйм³", "Устройства на суппортах, (B)(4)8 дюйм³", "Заземляющие проводники, (B)(5)0 дюйм³", "Требуемый объём23,25 дюйм³"]);
await calculate("zapolnenie-montazhnoy-korobki.html", { v: "295", v_unit: "0.06102374409473229" }, ["Объём коробки18,002 дюйм³ (295 см³)", "Заполнение объёма88,88 %", "Объём достаточен"]);
await calculate("zapolnenie-montazhnoy-korobki.html", { n14: "0", n6: "2", clamps: "1", yokes: "0", negc: "1", gegc: "10", v: "20" }, ["Проводники, 314.16(B)(1)10 дюйм³", "Внутренние зажимы, (B)(2)5 дюйм³", "Заземляющие проводники, (B)(5)2,5 дюйм³", "Требуемый объём17,5 дюйм³"]);
await calculate("zapolnenie-montazhnoy-korobki.html", { ydev: "12" }, ["Проводники, 314.16(B)(1)8 дюйм³", "Внутренние зажимы, (B)(2)2,25 дюйм³", "Устройства на суппортах, (B)(4)4,5 дюйм³", "Требуемый объём16,75 дюйм³", "Заполнение объёма93,06 %", "перемычка, целиком лежащая в коробке"], "boundary");
await calculate("zapolnenie-montazhnoy-korobki.html", { n14: "2,5" }, ["целое неотрицательное число"], "boundary");
await calculate("zapolnenie-montazhnoy-korobki.html", { n14: "0" }, ["хотя бы один изолированный проводник"], "boundary");
await calculate("zapolnenie-montazhnoy-korobki.html", { v: "0" }, ["Объём коробки должен быть больше нуля"], "boundary");

await calculate("zapolnenie-kabelnogo-koroba.html", {}, ["Сечение короба в свету1000 мм²", "Площадь кабелей по наружным диаметрам153,94 мм²", "Коэффициент заполнения15,39 %", "Предел ПУЭ 2.1.6140 %", "Максимум кабелей этого диаметра10 шт.", "ВердиктУкладывается в предел ПУЭ 2.1.61"]);
await calculate("zapolnenie-kabelnogo-koroba.html", { tip: "35" }, ["Предел ПУЭ 2.1.6135 %", "Допустимая площадь кабелей350 мм²", "Максимум кабелей этого диаметра9 шт.", "Укладывается в предел ПУЭ 2.1.61"]);
await calculate("zapolnenie-kabelnogo-koroba.html", { w: "60", h: "40", n1: "6", d1: "10", n2: "10", d2: "5" }, ["Сечение короба в свету2400 мм²", "Площадь кабелей по наружным диаметрам667,59 мм²", "Коэффициент заполнения27,82 %", "Резерв площади до предела292,41 мм²", "Ещё кабелей группы 1 до предела3 шт.", "Укладывается в предел ПУЭ 2.1.61"]);
await calculate("zapolnenie-kabelnogo-koroba.html", { tip: "35", w: "60", h: "40", n1: "6", d1: "10", n2: "20", d2: "5" }, ["Площадь кабелей по наружным диаметрам863,94 мм²", "Коэффициент заполнения36 %", "Превышение предела23,938 мм²", "ВердиктПредел ПУЭ 2.1.61 превышен"]);
await calculate("zapolnenie-kabelnogo-koroba.html", { w: "20", h: "10", n1: "6", d1: "5" }, ["Площадь кабелей по наружным диаметрам117,81 мм²", "Коэффициент заполнения58,9 %", "Максимум кабелей этого диаметра4 шт.", "ВердиктПредел ПУЭ 2.1.61 превышен"]);
await calculate("zapolnenie-kabelnogo-koroba.html", { w: "100", h: "20", n1: "8", d1: "11,283791670955125" }, ["Коэффициент заполнения40 %", "Максимум кабелей этого диаметра8 шт.", "Укладывается в предел ПУЭ 2.1.61"], "boundary");
await calculate("zapolnenie-kabelnogo-koroba.html", { w: "100", h: "20", n1: "8", d1: "11,29" }, ["Площадь кабелей по наружным диаметрам800,88 мм²", "Коэффициент заполнения40,04 %", "Максимум кабелей этого диаметра7 шт.", "Предел ПУЭ 2.1.61 превышен"], "boundary");
await calculate("zapolnenie-kabelnogo-koroba.html", { d1: "26" }, ["Кабель не помещается"], "boundary");
await calculate("zapolnenie-kabelnogo-koroba.html", { n2: "2", d2: "" }, ["Для группы 2 укажите наружный диаметр"], "boundary");
await calculate("zapolnenie-kabelnogo-koroba.html", { n1: "0" }, ["целое положительное число"], "boundary");

await calculate("vybor-difavtomata.html", { p: "3,5", iz: "19", isc: "1,5", icn: "6" }, ["Расчётный ток IB15,9 А", "Кандидат по номиналу In16 А", "15,9 ≤ 16 ≤ 19 А — выполняется", "6 ≥ 1,5 кА — выполняется", "Уставка IΔnне более 30 мА", "Минимальный тип по форме токаA", "СтатусБазовые условия выполняются"]);
await calculate("vybor-difavtomata.html", { p: "3,5" }, ["Кандидат по номиналу In16 А", "СтатусНедостаточно данных", "Уставка IΔnне более 30 мА"]);
await calculate("vybor-difavtomata.html", { p: "3,5", iz: "15", isc: "1,5" }, ["15,9 ≤ 16 ≤ 15 А — НЕ выполняется", "СтатусКандидат не подходит"]);
await calculate("vybor-difavtomata.html", { p: "3,5", iz: "19", isc: "7", icn: "6" }, ["6 ≥ 7 кА — НЕ выполняется", "СтатусКандидат не подходит"]);
await calculate("vybor-difavtomata.html", { faza: "3", p: "12", u: "380", c: "0,9", iz: "25", isc: "3", icn: "4,5", nz: "fire", load: "b" }, ["Расчётный ток IB20,3 А", "Кандидат по номиналу In25 А", "20,3 ≤ 25 ≤ 25 А — выполняется", "4,5 ≥ 3 кА — выполняется", "Уставка IΔnне более 300 мА", "Минимальный тип по форме токаB", "СтатусБазовые условия выполняются"], "boundary");
await calculate("vybor-difavtomata.html", { p: "1,5", u: "230", c: "0,8", load: "f" }, ["Расчётный ток IB8,15 А", "Кандидат по номиналу In10 А", "Минимальный тип по форме токаF", "СтатусНедостаточно данных"]);
await calculate("vybor-difavtomata.html", { p: "1", load: "ac" }, ["Минимальный тип по форме токаAC"]);
await calculate("vybor-difavtomata.html", { p: "7,4", iz: "40", isc: "3", icn: "6", load: "ev" }, ["Расчётный ток IB33,6 А", "Кандидат по номиналу In40 А", "40 ≤ 40 А — выполняется", "Защита зарядной точки EVУЗО типа B либо типа A с отключением при постоянной утечке более 6 мА", "СтатусБазовые условия выполняются", "п. 722.531.2.101", "RDC-DD по IEC 62955"]);
await calculate("vybor-difavtomata.html", { p: "7,4", iz: "40", isc: "3", icn: "6", load: "ev", nz: "fire" }, ["Уставка IΔnне более 30 мА — собственное УЗО каждой точки подключения", "Уставка 300 мА для зарядной точки не допускается"]);
await calculate("vybor-difavtomata.html", { p: "20" }, ["больше 63 А"], "boundary");
await calculate("vybor-difavtomata.html", { p: "3,5", c: "1,2" }, ["cos φ должен быть"], "boundary");
await calculate("vybor-difavtomata.html", { p: "3,5", iz: "19abc", isc: "1" }, ["Iz и ток КЗ должны быть числами"], "boundary");
await calculate("vybor-difavtomata.html", { p: "3,5", icn: "0" }, ["Отключающая способность должна быть больше нуля"], "boundary");
await calculate("vybor-difavtomata.html", { p: "3,5", iz: "19", isc: "0", icn: "6" }, ["Ожидаемый ток КЗ должен быть больше нуля"], "boundary");

await calculate("selektivnost-uzo.html", {}, ["Кратность IΔn₂ / IΔn₁3,333 — не меньше 3", "Время срабатывания по ПУЭ 7.1.73 (не менее чем втрое)не проверено", "при утечке от 30 до 50 мА отключается только нижестоящее", "Выдержка ступенейу вышестоящего больше — порядок верный", "СтатусНедостаточно данных: кратность и выдержки верны, время по ПУЭ 7.1.73 не проверено", "таблицы селективности изготовителя"]);
await calculate("selektivnost-uzo.html", { i2: "90" }, ["Кратность IΔn₂ / IΔn₁3 — не меньше 3", "СтатусНедостаточно данных: кратность и выдержки верны, время по ПУЭ 7.1.73 не проверено"], "boundary");
await calculate("selektivnost-uzo.html", { i2: "89" }, ["Кратность IΔn₂ / IΔn₁2,967 — меньше 3", "СтатусУсловия правила не выполняются", "ПУЭ 7.1.73 требует"], "boundary");
await calculate("selektivnost-uzo.html", { i2: "300", t2: "g" }, ["Кратность IΔn₂ / IΔn₁10 — не меньше 3", "временной селективности нет", "СтатусУсловия правила не выполняются", "оба аппарата могут отключиться одновременно"]);
await calculate("selektivnost-uzo.html", { i1: "100", t1: "s", i2: "300", t2: "s" }, ["Кратность IΔn₂ / IΔn₁3 — не меньше 3", "СтатусУсловия правила не выполняются", "Одинаковая выдержка"]);
await calculate("selektivnost-uzo.html", { i1: "100", t1: "s", i2: "1000", t2: "r" }, ["Кратность IΔn₂ / IΔn₁10 — не меньше 3", "порядок верный", "СтатусНедостаточно данных: кратность и выдержки верны, время по ПУЭ 7.1.73 не проверено"]);
await calculate("selektivnost-uzo.html", { i1: "30", t1: "g", i2: "100", t2: "r" }, ["порядок верный", "СтатусНедостаточно данных: кратность и выдержки верны, время по ПУЭ 7.1.73 не проверено"]);
await calculate("selektivnost-uzo.html", { i2: "30", t2: "g" }, ["Кратность IΔn₂ / IΔn₁1 — меньше 3", "диапазона нет", "СтатусУсловия правила не выполняются"]);
await calculate("selektivnost-uzo.html", { i2: "60" }, ["Кратность IΔn₂ / IΔn₁2 — меньше 3", "диапазона нет"], "boundary");
await calculate("selektivnost-uzo.html", { i1: "0" }, ["Уставки IΔn должны быть больше нуля"], "boundary");
await calculate("selektivnost-uzo.html", { i2: "-100" }, ["Уставки IΔn должны быть больше нуля"], "boundary");
await calculate("selektivnost-uzo.html", { i1: "30abc" }, ["Введите уставки IΔn"], "boundary");

await calculate("dlina-kabelya-po-toku-kz.html", {}, ["Ток срабатывания Ia160 А (10·In, верхняя граница мгновенного расцепления)", "Отношение сечений m = Sф / SPE1", "Удельное сопротивление ρ0,0225 Ом·мм²/м", "Предельная длина Lmax61,111 м", "Предельное сопротивление петли 0,8·U₀ / Ia1,1 Ом", "СтатусНедостаточно данных: длина линии не задана"]);
await calculate("dlina-kabelya-po-toku-kz.html", { l: "50" }, ["Фактическая длина L50 м", "Запас Lmax / L1,222", "СтатусУсловие метода выполняется"]);
await calculate("dlina-kabelya-po-toku-kz.html", { l: "61,2" }, ["СтатусУсловие метода не выполняется"]);
await calculate("dlina-kabelya-po-toku-kz.html", { u: "230", mat: "0.036", sph: "16", spe: "16", dev: "10", inn: "32" }, ["Ток срабатывания Ia320 А", "Удельное сопротивление ρ0,036 Ом·мм²/м", "Предельная длина Lmax127,78 м", "Предельное сопротивление петли 0,8·U₀ / Ia575 мОм"]);
await calculate("dlina-kabelya-po-toku-kz.html", { sph: "16", spe: "10", dev: "20", inn: "25" }, ["Ток срабатывания Ia500 А (20·In", "Отношение сечений m = Sф / SPE1,6", "Предельная длина Lmax96,274 м", "352 мОм", "допускает для D и 50·In"]);
await calculate("dlina-kabelya-po-toku-kz.html", { dev: "50", inn: "16" }, ["Ток срабатывания Ia800 А (50·In, верхняя граница мгновенного расцепления)", "Предельная длина Lmax12,222 м", "220 мОм", "взято 50·In"]);
await calculate("dlina-kabelya-po-toku-kz.html", { l: "60" }, ["Запас Lmax / L1,019", "СтатусУсловие метода выполняется"]);
await calculate("dlina-kabelya-po-toku-kz.html", { dev: "5", inn: "16" }, ["Ток срабатывания Ia80 А (5·In", "Предельная длина Lmax122,22 м"]);
await calculate("dlina-kabelya-po-toku-kz.html", { dev: "im", im: "1000", sph: "50", spe: "25" }, ["Ток срабатывания Ia1200 А (Im + 20% допуска)", "Отношение сечений m = Sф / SPE2", "Предельная длина Lmax108,64 м", "146,7 мОм"]);
await calculate("dlina-kabelya-po-toku-kz.html", { dev: "ia", ia: "100", sph: "1,5", spe: "1,5" }, ["Ток срабатывания Ia100 А (задан вручную)", "Предельная длина Lmax58,667 м", "1,76 Ом"]);
await calculate("dlina-kabelya-po-toku-kz.html", { u: "225", sph: "4", spe: "4", dev: "5", inn: "10", l: "320" }, ["Предельная длина Lmax320 м", "Запас Lmax / L1", "СтатусУсловие метода выполняется"], "boundary");
await calculate("dlina-kabelya-po-toku-kz.html", { u: "225", sph: "4", spe: "4", dev: "5", inn: "10", l: "320,01" }, ["СтатусУсловие метода не выполняется"], "boundary");
await calculate("dlina-kabelya-po-toku-kz.html", { u: "380" }, ["Предельная длина Lmax105,56 м", "Проверьте напряжение"]);
await calculate("dlina-kabelya-po-toku-kz.html", { sph: "120", spe: "70", dev: "im", im: "2000" }, ["Отношение сечений m = Sф / SPE1,714", "Предельная длина Lmax144,09 м"], "boundary");
await calculate("dlina-kabelya-po-toku-kz.html", { sph: "150" }, ["больше 120 мм²"], "boundary");
await calculate("dlina-kabelya-po-toku-kz.html", { sph: "0" }, ["Напряжение и сечения должны быть больше нуля"], "boundary");
await calculate("dlina-kabelya-po-toku-kz.html", { inn: "-16" }, ["Номинал автомата должен быть больше нуля"], "boundary");
await calculate("dlina-kabelya-po-toku-kz.html", { l: "50abc" }, ["Фактическая длина должна быть числом"], "boundary");
await calculate("dlina-kabelya-po-toku-kz.html", { dev: "im", im: "" }, ["Введите уставку мгновенного расцепителя Im"], "boundary");

{
  kind = "structural";
  const dom = await load("dlina-kabelya-po-toku-kz.html");
  const { document, Event } = dom.window;
  const visible = id => document.getElementById(`f_${id}`).style.display !== "none";
  check(visible("inn") && !visible("im") && !visible("ia"), "dlina-kabelya-po-toku-kz: в режиме B/C/D должен быть виден только In");
  const dev = document.getElementById("dev");
  dev.value = "im"; dev.dispatchEvent(new Event("change", { bubbles: true }));
  check(!visible("inn") && visible("im") && !visible("ia"), "dlina-kabelya-po-toku-kz: в режиме Im должно быть видно только поле Im");
  dev.value = "ia"; dev.dispatchEvent(new Event("change", { bubbles: true }));
  check(!visible("inn") && !visible("im") && visible("ia"), "dlina-kabelya-po-toku-kz: в режиме Ia должно быть видно только поле Ia");
  dom.window.close();
}
{
  kind = "structural";
  const dom = await load("vybor-difavtomata.html");
  const { document, Event } = dom.window;
  const faza = document.getElementById("faza"), u = document.getElementById("u");
  faza.value = "3"; faza.dispatchEvent(new Event("change", { bubbles: true }));
  check(u.value === "380", "vybor-difavtomata: три фазы не установили 380 В");
  faza.value = "1"; faza.dispatchEvent(new Event("change", { bubbles: true }));
  check(u.value === "220", "vybor-difavtomata: одна фаза не вернула 220 В");
  dom.window.close();
}
{
  kind = "functional";
  const dom = await load("vybor-difavtomata.html");
  const { document } = dom.window;
  setValues(document, { p: "7,4", load: "ev" });
  document.getElementById("go").click();
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  const res = document.getElementById("res").textContent;
  check(/Защита зарядной точки EV/.test(res) && !/Минимальный тип по форме тока/.test(res),
    "vybor-difavtomata: для EV тип B нельзя называть минимальным — допустим и тип A с отключением постоянной утечки 6 мА");
  setValues(document, { load: "b" });
  document.getElementById("go").click();
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  check(!/722\.531\.2\.101/.test(document.getElementById("res").textContent),
    "vybor-difavtomata: требование к зарядной точке EV выводится для привода или PV-инвертора");
  dom.window.close();
}

// --- data_i.py: ток утечки группы, сечение PEN, зона срабатывания B/C/D,
// ток КЗ петля фаза-PE (+ метод композиции), кольцевой заземлитель ---

await calculate("summarnyy-tok-utechki-uzo.html", {}, ["Утечка приборов по паспорту или замеру1 мА (1 шт.)", "Утечка приборов по оценке ПУЭ (0,4 мА на 1 А)4 мА (1 шт.)", "Утечка сети (10 мкА на 1 м)0,3 мА", "Суммарный ток утечки5,3 мА", "Доля от IΔn = 30 мА17,67 %", "ПУЭ 7.1.83: не более ⅓·IΔn = 10 мАВыполняется", "IEC 60364-5-53, 531.3.2: не более 30 % IΔn = 9 мАВыполняется", "Рекомендация Schneider Electric: не более 0,25·IΔn = 7,5 мАВыполняется", "СтатусОценка: часть утечек принята по ПУЭ 7.1.83"]);
await calculate("summarnyy-tok-utechki-uzo.html", { c3: "12", c3_unit: "0.4" }, ["Утечка приборов по оценке ПУЭ (0,4 мА на 1 А)8,8 мА (2 шт.)", "Суммарный ток утечки10,1 мА", "ПУЭ 7.1.83: не более ⅓·IΔn = 10 мАНе выполняется", "Разделите нагрузку на несколько групп"]);
await calculate("summarnyy-tok-utechki-uzo.html", { c1: "3,5", c2: "3,5", c2_unit: "1", c3: "3", l: "0" }, ["Суммарный ток утечки10 мА", "ПУЭ 7.1.83: не более ⅓·IΔn = 10 мАВыполняется", "IEC 60364-5-53, 531.3.2: не более 30 % IΔn = 9 мАНе выполняется", "Рекомендация Schneider Electric: не более 0,25·IΔn = 7,5 мАНе выполняется", "СтатусРасчёт по введённым значениям утечек"], "boundary");
await calculate("summarnyy-tok-utechki-uzo.html", { c1: "3,5", c2: "3,5", c2_unit: "1", c3: "3,01", l: "0" }, ["Суммарный ток утечки10,01 мА", "ПУЭ 7.1.83: не более ⅓·IΔn = 10 мАНе выполняется"], "boundary");
await calculate("summarnyy-tok-utechki-uzo.html", { uzo: "10", c1: "2,5", c2: "2,5", c2_unit: "1", l: "0" }, ["Суммарный ток утечки5 мА", "ПУЭ 7.1.83: не более ⅓·IΔn = 3,333 мАНе выполняется", "не меньше 0,5·IΔn = 5 мА"], "boundary");
await calculate("summarnyy-tok-utechki-uzo.html", { c1: "10", c1_unit: "1", c2: "", l: "0" }, ["Суммарный ток утечки10 мА", "СтатусРасчёт по введённым значениям утечек"]);
await calculate("summarnyy-tok-utechki-uzo.html", { c1: "10", c1_unit: "0.4", c2: "", l: "0" }, ["Суммарный ток утечки4 мА", "СтатусОценка: часть утечек принята по ПУЭ 7.1.83"]);
await calculate("summarnyy-tok-utechki-uzo.html", { c1: "1", c1_unit: "1", c2: "2", c2_unit: "1", l: "30" }, ["Утечка сети (10 мкА на 1 м)0,3 мА", "Суммарный ток утечки3,3 мА", "СтатусОценка: утечка сети принята по ПУЭ 7.1.83", "Условие ПУЭ 7.1.83 выполняется по оценке"]);
await invalid("summarnyy-tok-utechki-uzo.html", { c1: "-1" }, "Потребитель 1: значение не может быть отрицательным");
await invalid("summarnyy-tok-utechki-uzo.html", { c2: "abc" }, "Потребитель 2: введите число или оставьте поле пустым");
await invalid("summarnyy-tok-utechki-uzo.html", { c1: "", c2: "", l: "0" }, "Укажите хотя бы одного потребителя");
await invalid("summarnyy-tok-utechki-uzo.html", { l: "" }, "Введите суммарную длину фазных проводников");
await invalid("summarnyy-tok-utechki-uzo.html", { c1: "1e308", c1_unit: "1", c2: "1e308", c2_unit: "1" }, "слишком велики");

await calculate("sechenie-pen-provodnika.html", {}, ["По правилу PE (ПУЭ 1.7.126, табл. 1.7.5)16 мм²", "Сечение N (ПУЭ 7.1.45)16 мм² — равно фазному", "Механический минимум PEN (ПУЭ 1.7.131, 7.1.45)10 мм²", "Определяющее условиеправило PE, сечение N", "Принять по стандартному ряду16 мм²", "СтатусМинимум по ПУЭ; стойкость к току КЗ не проверялась"]);
await calculate("sechenie-pen-provodnika.html", { s: "6" }, ["Определяющее условиемеханический минимум", "Принять по стандартному ряду10 мм²", "Кабель с жилами 6 мм²Совмещать PE и N в его жиле нельзя", "СтатусЖилы тоньше минимума PEN"]);
await calculate("sechenie-pen-provodnika.html", { s: "6", metal: "al" }, ["Механический минимум PEN (ПУЭ 1.7.131, 7.1.45)16 мм²", "Принять по стандартному ряду16 мм²", "не менее 16 мм² по алюминию"]);
await calculate("sechenie-pen-provodnika.html", { s: "95", nagr: "odn" }, ["По правилу PE (ПУЭ 1.7.126, табл. 1.7.5)47,5 мм²", "Сечение N (ПУЭ 7.1.45)95 мм² — равно фазному", "Определяющее условиесечение N", "Принять по стандартному ряду95 мм²"]);
await calculate("sechenie-pen-provodnika.html", { s: "95", nagr: "sim" }, ["Сечение N (ПУЭ 7.1.45)47,5 мм² — не менее 50 % фазного", "Минимальное сечение PEN47,5 мм²", "Принять по стандартному ряду50 мм²", "СтатусМинимум по ПУЭ для нагрузки без заметных гармоник", "Уменьшенный N допустим только", "с учётом гармоник", "п. 524.3"]);
await calculate("sechenie-pen-provodnika.html", { s: "35", metal: "al", nagr: "sim" }, ["Сечение N (ПУЭ 7.1.45)17,5 мм² — не менее 50 % фазного", "Принять по стандартному ряду25 мм²"]);
await calculate("sechenie-pen-provodnika.html", { s: "25", metal: "al", nagr: "sim" }, ["Сечение N (ПУЭ 7.1.45)25 мм² — равно фазному", "Принять по стандартному ряду25 мм²"], "boundary");
await calculate("sechenie-pen-provodnika.html", { s: "25,01", metal: "al", nagr: "sim" }, ["Определяющее условиеправило PE, механический минимум", "Принять по стандартному ряду16 мм²"], "boundary");
await calculate("sechenie-pen-provodnika.html", { s: "300" }, ["Принять по стандартному рядусвыше 240 мм² — вне стандартного ряда", "СтатусНужен отдельный расчёт"], "boundary");
await calculate("sechenie-pen-provodnika.html", { cep: "1" }, ["Совмещённый PEN-проводникНе допускается", "ОснованиеПУЭ 1.7.132", "СтатусНужен отдельный защитный проводник PE"]);
await invalid("sechenie-pen-provodnika.html", { s: "0" }, "Сечение должно быть больше нуля");
await invalid("sechenie-pen-provodnika.html", { s: "abc" }, "Введите сечение фазной жилы");

await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design" }, ["Кратность тока Iкз/In25", "Диапазон мгновенного расцепления Cсвыше 5·In до 10·In (80…160 А)", "ЗонаГарантированное мгновенное расцепление", "СтатусМгновенное отключение гарантировано характеристикой", "быстрее 0,1 с"]);
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "0,4", ik_unit: "1000" }, ["Кратность тока Iкз/In25", "ЗонаГарантированное мгновенное расцепление"]);
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "160" }, ["Кратность тока Iкз/In10", "ЗонаГарантированное мгновенное расцепление"], "boundary");
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "159" }, ["Кратность тока Iкз/In9,938", "ЗонаРазброс электромагнитного расцепителя", "СтатусМгновенное отключение не гарантировано"], "boundary");
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "80" }, ["Кратность тока Iкз/In5", "ЗонаТепловой расцепитель", "СтатусОтключение с выдержкой времени", "не срабатывает: его порог лежит выше 5·In", "в пределах условного времени 1 ч", "от 1 до 60 с"], "boundary");
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "100", in: "40", tip: "B" }, ["Кратность тока Iкз/In2,5", "Диапазон мгновенного расцепления Bсвыше 3·In до 5·In (120…200 А)", "ЗонаТепловой расцепитель", "от 1 до 120 с"]);
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "23,2" }, ["Кратность тока Iкз/In1,45", "ЗонаТепловой расцепитель"], "boundary");
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "20" }, ["Кратность тока Iкз/In1,25", "ЗонаМежду условными токами нерасцепления и расцепления", "СтатусОтключение не гарантировано"]);
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "18,08" }, ["Кратность тока Iкз/In1,13", "ЗонаНе выше условного тока нерасцепления 1,13·In"], "boundary");
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "18" }, ["Кратность тока Iкз/In1,125", "ЗонаНе выше условного тока нерасцепления 1,13·In", "СтатусНе отключается в течение условного времени 1 ч", "после этого времени, стандарт не нормирует"]);
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "100", in: "80", tip: "D" }, ["ЗонаМежду условными токами нерасцепления и расцепления", "условного времени 2 ч", "50·In"]);
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "400", in: "16", tip: "D" }, ["Диапазон мгновенного расцепления Dсвыше 10·In до 20·In (160…320 А)", "ЗонаГарантированное мгновенное расцепление", "Граница 20·In для D должна подтверждаться паспортом"]);
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "400", in: "16", tip: "D50" }, ["Диапазон мгновенного расцепления Dсвыше 10·In до 50·In (160…800 А)", "ЗонаРазброс электромагнитного расцепителя", "СтатусМгновенное отключение не гарантировано", "взято 50·In"]);
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "800", in: "16", tip: "D50" }, ["Кратность тока Iкз/In50", "ЗонаГарантированное мгновенное расцепление"], "boundary");
await calculate("zona-srabatyvaniya-avtomata.html", { iksrc: "design", ik: "799", in: "16", tip: "D50" }, ["Кратность тока Iкз/In49,94", "ЗонаРазброс электромагнитного расцепителя"], "boundary");
await calculate("zona-srabatyvaniya-avtomata.html", {}, ["ЗонаГарантированное мгновенное расцепление", "СтатусНедостаточно данных: ток КЗ измерен без поправки на худшие условия", "Зона показана справочно"]);
await invalid("zona-srabatyvaniya-avtomata.html", { in: "0" }, "Ток КЗ и номинал автомата должны быть больше нуля");
await invalid("zona-srabatyvaniya-avtomata.html", { in: "160" }, "Номинал больше 125 А");
await invalid("zona-srabatyvaniya-avtomata.html", { ik: "" }, "Введите ток КЗ и номинал автомата");
await invalid("zona-srabatyvaniya-avtomata.html", { ik: "1e308", in: "1e-308" }, "слишком велики");

await calculate("tok-kz-petlya-faza-pe.html", {}, ["Сопротивление петли линии Zц (фаза + PE)0,54 Ом", "Ток КЗ в конце линии (0,8·U₀/Zц)325,9 А", "Порог гарантированного мгновенного расцепления Ia160 А (10·In)", "Запас Iкз / Ia2,04", "Предельная длина линии по этому условию61,11 м", "СтатусУсловие мгновенного расцепления выполняется"]);
await calculate("tok-kz-petlya-faza-pe.html", { tip: "5" }, ["Порог гарантированного мгновенного расцепления Ia80 А (5·In)", "Предельная длина линии по этому условию122,2 м"]);
await calculate("tok-kz-petlya-faza-pe.html", { tip: "20" }, ["Порог гарантированного мгновенного расцепления Ia320 А (20·In)", "Запас Iкз / Ia1,02", "Предельная длина линии по этому условию30,56 м", "допускает для D и 50·In"]);
await calculate("tok-kz-petlya-faza-pe.html", { tip: "50" }, ["Порог гарантированного мгновенного расцепления Ia800 А (50·In)", "Запас Iкз / Ia0,407", "Предельная длина линии по этому условию12,22 м", "СтатусУсловие мгновенного расцепления не выполняется", "взято 50·In"]);
await calculate("tok-kz-petlya-faza-pe.html", { u: "225", sph: "4", spe: "4", l: "100" }, ["Сопротивление петли линии Zц (фаза + PE)1,125 Ом", "Ток КЗ в конце линии (0,8·U₀/Zц)160 А", "Предельная длина линии по этому условию100 м", "СтатусУсловие мгновенного расцепления выполняется"], "boundary");
await calculate("tok-kz-petlya-faza-pe.html", { u: "225", sph: "4", spe: "4", l: "101" }, ["Ток КЗ в конце линии (0,8·U₀/Zц)158,4 А", "СтатусУсловие мгновенного расцепления не выполняется"], "boundary");
await calculate("tok-kz-petlya-faza-pe.html", { mat: "al", sph: "16", spe: "16", l: "100", in: "63" }, ["Сопротивление петли линии Zц (фаза + PE)0,45 Ом", "Ток КЗ в конце линии (0,8·U₀/Zц)391,1 А", "Порог гарантированного мгновенного расцепления Ia630 А (10·In)", "Предельная длина линии по этому условию62,08 м", "СтатусУсловие мгновенного расцепления не выполняется"]);
await calculate("tok-kz-petlya-faza-pe.html", { sph: "35", spe: "16", l: "100", in: "63" }, ["Сопротивление петли линии Zц (фаза + PE)0,2049 Ом", "Ток КЗ в конце линии (0,8·U₀/Zц)858,9 А", "Предельная длина линии по этому условию136,3 м", "СтатусУсловие мгновенного расцепления выполняется"]);
await calculate("tok-kz-petlya-faza-pe.html", { mode: "comp", ik0: "1", ik0_unit: "1000", ik0src: "design" }, ["Сопротивление сети до автомата U₀/I′0,22 Ом", "Ток КЗ в конце линии (метод композиции)289,5 А", "Напряжение в месте установки автомата при этом КЗ≈ 71,1 % U₀", "Предельная длина линии по этому условию64,17 м", "СтатусУсловие мгновенного расцепления выполняется", "было бы оптимистичным"]);
await calculate("tok-kz-petlya-faza-pe.html", { mode: "comp", ik0: "1", ik0_unit: "1000" }, ["Ток КЗ в конце линии (метод композиции)289,5 А", "СтатусНедостаточно данных", "измерен без поправки на худшие условия"]);
await calculate("tok-kz-petlya-faza-pe.html", { mode: "comp", ik0: "150", ik0_unit: "1", ik0src: "design" }, ["Ток КЗ в конце линии (метод композиции)109,6 А", "Предельная длина линии по этому условиюнет: ток КЗ на вводе не выше Ia", "СтатусУсловие мгновенного расцепления не выполняется"], "boundary");
await calculate("tok-kz-petlya-faza-pe.html", { mode: "comp", ik0: "800", ik0_unit: "1", ik0src: "design" }, ["Сопротивление сети до автомата U₀/I′0,275 Ом", "Предельная длина линии по этому условию61,11 м"], "boundary");
await calculate("tok-kz-petlya-faza-pe.html", { mode: "comp", ik0: "400", ik0_unit: "1", ik0src: "design", l: "60" }, ["Сопротивление петли линии Zц (фаза + PE)1,08 Ом", "Ток КЗ в конце линии (метод композиции)135 А", "Предельная длина линии по этому условию45,83 м", "СтатусУсловие мгновенного расцепления не выполняется"]);
await invalid("tok-kz-petlya-faza-pe.html", { l: "0" }, "Напряжение, длина линии и номинал должны быть больше нуля");
await invalid("tok-kz-petlya-faza-pe.html", { mode: "comp", ik0: "" }, "Введите ток однофазного КЗ в месте установки автомата");
await invalid("tok-kz-petlya-faza-pe.html", { mode: "comp", ik0: "-1" }, "Ток КЗ в месте установки автомата должен быть больше нуля");
await invalid("tok-kz-petlya-faza-pe.html", { u: "1e308", l: "1e-300" }, "слишком велики");

await calculate("kolcevoy-zazemlitel.html", {}, ["Длина замкнутого контура L40 м", "Оценочное сопротивление R ≈ 2ρ/L2,5 Ом", "Возможное занижение формулы (однородный грунт)до 17 %", "Сравнение с целью2,5 Ом — не выше заданной цели и с учётом возможного занижения формулы", "Длина контура для цели 10 Ом по формуле10 м", "СтатусОценка, требуется измерение"]);
await calculate("kolcevoy-zazemlitel.html", { grunt: "500" }, ["Оценочное сопротивление R ≈ 2ρ/L25 Ом", "Сравнение с целью25 Ом — оценка выше заданной цели", "Длина контура для цели 10 Ом по формуле100 м"]);
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "25", rho: "50", rt: "4" }, ["Длина замкнутого контура L25 м", "Оценочное сопротивление R ≈ 2ρ/L4 Ом", "Возможное занижение формулы (однородный грунт)до 9 %", "Сравнение с целью4 Ом — оценка не выше цели, но запас меньше возможного занижения — цель не подтверждена", "Длина контура для цели 4 Ом по формуле25 м"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "24", rho: "50", rt: "4" }, ["Оценочное сопротивление R ≈ 2ρ/L4,167 Ом", "Сравнение с целью4,167 Ом — оценка выше заданной цели"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "15", rho: "50", rt: "6,8" }, ["Оценочное сопротивление R ≈ 2ρ/L6,667 Ом", "Возможное занижение формулы (однородный грунт)нет: для контура до 15 м формула скорее завышает R", "Сравнение с целью6,667 Ом — оценка не выше цели, но форма контура не задана", "скорее завышает сопротивление"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "15,01", rho: "50", rt: "6,8" }, ["Возможное занижение формулы (однородный грунт)до 5 %", "запас меньше возможного занижения — цель не подтверждена"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { a: "12", b: "8", rho: "100", rt: "5,85" }, ["Оценочное сопротивление R ≈ 2ρ/L5 Ом", "Сравнение с целью5 Ом — не выше заданной цели и с учётом возможного занижения формулы"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { a: "12", b: "8", rho: "100", rt: "5,84" }, ["Сравнение с целью5 Ом — оценка не выше цели, но запас меньше возможного занижения — цель не подтверждена"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "150", rho: "100", rt: "5" }, ["Возможное занижение формулы (однородный грунт)до 38 %", "оценка не выше цели, но форма контура не задана"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "150,01", rho: "100", rt: "5" }, ["Возможное занижение формулы (однородный грунт)не оценивалось: контур длиннее 150 м", "погрешность формулы для такого контура не оценивалась", "может превышать 38 %"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { a: "30", b: "1", rho: "100", rt: "5" }, ["Длина замкнутого контура L62 м", "Возможное занижение формулы (однородный грунт)не оценивалось: стороны контура длиннее 3:1", "погрешность формулы для такого контура не оценивалась", "длиннее 3:1 занижение формулы больше"]);
await calculate("kolcevoy-zazemlitel.html", { a: "15", b: "5", rho: "100", rt: "10" }, ["Возможное занижение формулы (однородный грунт)до 17 %", "Сравнение с целью5 Ом — не выше заданной цели и с учётом возможного занижения формулы"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { a: "15,01", b: "5", rho: "100", rt: "10" }, ["не оценивалось: стороны контура длиннее 3:1"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "40", rho: "100", rt: "10" }, ["Возможное занижение формулы (однородный грунт)до 17 % — при сторонах не длиннее 3:1", "Сравнение с целью5 Ом — оценка не выше цели, но форма контура не задана — чтобы учесть занижение формулы, задайте стороны", "цель с учётом занижения не подтверждается"]);
await calculate("kolcevoy-zazemlitel.html", { a: "12", b: "8", rho: "100", rt: "10" }, ["Сравнение с целью5 Ом — не выше заданной цели и с учётом возможного занижения формулы"]);
await invalid("kolcevoy-zazemlitel.html", { rho: "-1" }, "Удельное сопротивление и цель должны быть больше нуля");
await invalid("kolcevoy-zazemlitel.html", { a: "0" }, "Стороны контура должны быть больше нуля");
await invalid("kolcevoy-zazemlitel.html", { zad: "l", l: "" }, "Введите длину замкнутого проводника");
await invalid("kolcevoy-zazemlitel.html", { rho: "1e308", zad: "l", l: "1e-300" }, "слишком велики");

{
  kind = "structural";
  const text = file => fs.readFileSync(path.join(sourceDir, file), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const pen = text("sechenie-pen-provodnika.html");
  check(/питающиеся по однофазным ответвлениям от ВЛ/.test(pen),
    "sechenie-pen-provodnika: исключение ПУЭ 1.7.145 распространено на все частные дома — потеряно условие об однофазных ответвлениях от ВЛ");
  check(/ГОСТ Р 50571\.5\.52-2011/.test(pen) && /без заметных гармоник/.test(pen),
    "sechenie-pen-provodnika: уменьшенный N предлагается без условия о гармониках (ГОСТ Р 50571.5.52-2011, п. 524.3)");
  check(/прогретый автомат/.test(text("zona-srabatyvaniya-avtomata.html")),
    "zona-srabatyvaniya-avtomata: не сказано, что испытание при 1,45·In идёт сразу после 1,13·In, из нагретого состояния");
  const loop = text("tok-kz-petlya-faza-pe.html");
  check(!/уже не конвенциональный метод/.test(loop),
    "tok-kz-petlya-faza-pe: подход калькулятора минимального тока КЗ объявлен «не конвенциональным методом»");
  check(/I′ = 5·Ia/.test(loop), "tok-kz-petlya-faza-pe: нет условия, при котором методы дают одну предельную длину");
  const ring = text("kolcevoy-zazemlitel.html");
  check(!/как выше, так и ниже/.test(ring), "kolcevoy-zazemlitel: направление погрешности формулы скрыто");
  check(/множитель 2 дословно не виден/.test(ring) && /проверена независимо/.test(ring),
    "kolcevoy-zazemlitel: множитель 2 приписан Schneider без оговорки, что дословно он не сверен и проверен численно");
  check(/занижает/.test(ring) && /численн/.test(ring),
    "kolcevoy-zazemlitel: не сказано, что для типичного дома формула занижает R, или не указан численный расчёт");
}
{
  kind = "structural";
  const dom = await load("tok-kz-petlya-faza-pe.html");
  const { document, Event } = dom.window;
  const visible = id => document.getElementById(`f_${id}`).style.display !== "none";
  check(!visible("ik0") && !visible("ik0src"), "tok-kz-petlya-faza-pe: в конвенциональном режиме поля I′ должны быть скрыты");
  const mode = document.getElementById("mode");
  mode.value = "comp"; mode.dispatchEvent(new Event("change", { bubbles: true }));
  check(visible("ik0") && visible("ik0src"), "tok-kz-petlya-faza-pe: в режиме композиции поля I′ должны быть видны");
  check(Boolean(document.querySelector('a[href="dlina-kabelya-po-toku-kz.html"]')),
    "tok-kz-petlya-faza-pe: нет ссылки на калькулятор максимальной длины линии");
  dom.window.close();
}

{
  kind = "structural";
  const text = file => fs.readFileSync(path.join(sourceDir, file), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const box = text("zapolnenie-montazhnoy-korobki.html");
  check(/NFPA 70/.test(box) && /не ПУЭ/.test(box), "zapolnenie-montazhnoy-korobki: не сказано, что это NEC, а не ПУЭ");
  check(/не больше четырёх EGC/.test(box) && /четверть объёма/.test(box), "zapolnenie-montazhnoy-korobki: нет правила EGC редакций 2020/2023");
  const duct = text("zapolnenie-kabelnogo-koroba.html");
  check(/2\.1\.61/.test(duct) && /35%/.test(duct) && /40%/.test(duct), "zapolnenie-kabelnogo-koroba: нет пределов ПУЭ 2.1.61");
  check(/процента заполнения не задаёт/.test(duct), "zapolnenie-kabelnogo-koroba: не сказано, что для лотков ПУЭ процента не задаёт");
  const sel = text("selektivnost-uzo.html");
  check(/ПУЭ 7\.1\.73/.test(sel) && /таблиц[а-я]* селективности изготовителя/.test(sel), "selektivnost-uzo: нет ПУЭ 7.1.73 или оговорки о таблицах изготовителя");
  check(!/Селективность обеспечена|Селективно без оговорок/.test(sel), "selektivnost-uzo: категоричный вердикт селективности");
  const len = text("dlina-kabelya-po-toku-kz.html");
  check(/источник считает такое приближение допустимым для сечений до 120 мм²/.test(len) && !/не цитата источника/.test(len),
    "dlina-kabelya-po-toku-kz: предел 120 мм² взят у Schneider Electric (приближение без реактивного сопротивления), а не является собственной границей");
  check(!/0,1\s*с/.test(len), "dlina-kabelya-po-toku-kz: обещание конкретного времени отключения");
  check(!/ровно предельное Z/.test(len), "dlina-kabelya-po-toku-kz: предел петли самой линии выдан за полное Z калькулятора минимального тока КЗ");
  check(/I′ = 5·Ia/.test(len) && /оптимистичен/.test(len), "dlina-kabelya-po-toku-kz: не сказано, что при I′ < 5·Ia результат оптимистичен");
  const dif = text("vybor-difavtomata.html");
  check(/ГОСТ Р 50571\.7\.722-2017/.test(dif) && /722\.531\.2\.101/.test(dif),
    "vybor-difavtomata: нет источника требования к УЗО зарядной точки EV");
  check(!/По геометрии в такой короб/.test(duct), "zapolnenie-kabelnogo-koroba: предел ПУЭ выдан за геометрическую вместимость");
}

// --- data_j.py: многотарифный счётчик, нагрузка ввода дома, удлинитель на
// катушке, сопротивление изоляции, розеточная группа ---

await calculate("mnogotarifnyy-schetchik.html", { zony: "2", e_day: "180", e_night: "120", t_day: "6", t_night: "3", t_one: "5" }, ["Дневная зона: 180 кВт·ч × 6 ₽1080,00 ₽", "Ночная зона: 120 кВт·ч × 3 ₽360,00 ₽", "Всего израсходовано300 кВт·ч", "Доля ночного расхода40 %", "Итого по зонам1440,00 ₽", "Средняя цена 1 кВт·ч4,8 ₽", "По одноставочному тарифу1500,00 ₽", "СравнениеЗонный учёт дешевле на 60,00 ₽"]);
await calculate("mnogotarifnyy-schetchik.html", { zony: "3", e_peak: "50", e_half: "100", e_night: "150", t_peak: "7,5", t_half: "5,25", t_night: "2,5" }, ["Пиковая зона: 50 кВт·ч × 7,5 ₽375,00 ₽", "Полупиковая зона: 100 кВт·ч × 5,25 ₽525,00 ₽", "Ночная зона: 150 кВт·ч × 2,5 ₽375,00 ₽", "Дневной расход (пик + полупик)150 кВт·ч", "Доля ночного расхода50 %", "Итого по зонам1275,00 ₽", "Средняя цена 1 кВт·ч4,25 ₽"]);
await calculate("mnogotarifnyy-schetchik.html", { zony: "2", e_day: "300", e_night: "0", t_day: "6", t_night: "3", t_one: "5" }, ["Итого по зонам1800,00 ₽", "СравнениеЗонный учёт дороже на 300,00 ₽"], "boundary");
await calculate("mnogotarifnyy-schetchik.html", { zony: "2", e_day: "100", e_night: "100", t_day: "5", t_night: "5", t_one: "5" }, ["СравнениеОдинаково"], "boundary");
await calculate("mnogotarifnyy-schetchik.html", { zony: "2", e_day: "1,005", e_night: "0", t_day: "1", t_night: "1" }, ["Итого по зонам1,01 ₽"], "boundary");
await calculate("mnogotarifnyy-schetchik.html", { zony: "2", e_peak: "мусор", t_peak: "мусор", e_day: "180", e_night: "120", t_day: "6", t_night: "3" }, ["Итого по зонам1440,00 ₽"]);
await calculate("mnogotarifnyy-schetchik.html", { zony: "2", e_day: "-1", e_night: "10", t_day: "6", t_night: "3" }, ["Расход не может быть отрицательным"], "boundary");
await calculate("mnogotarifnyy-schetchik.html", { zony: "2", e_day: "0", e_night: "0", t_day: "6", t_night: "3" }, ["Суммарный расход равен нулю"], "boundary");
await calculate("mnogotarifnyy-schetchik.html", { zony: "2", e_day: "10", e_night: "10", t_day: "6", t_night: "3", t_one: "abc" }, ["Одноставочный тариф должен быть числом"], "boundary");
await calculate("mnogotarifnyy-schetchik.html", { zony: "3", e_peak: "10", e_half: "10", e_night: "10", t_peak: "0", t_half: "5", t_night: "3" }, ["Ставка зоны должна быть больше нуля"], "boundary");

await calculate("nagruzka-vvoda-doma.html", { faza: "1", u: "220", p_light: "1", k_light: "1", p_sock: "8", k_sock: "0,2", p_pow: "6", k_pow: "0,5", ko: "1", cos: "1" }, ["Освещение: 1 кВт × 11 кВт", "Розетки общего назначения: 8 кВт × 0,21,6 кВт", "Стационарные силовые приборы: 6 кВт × 0,53 кВт", "Установленная мощность15 кВт", "Расчётная мощность ввода Pр5,6 кВт", "Итоговый коэффициент Pр / Pуст0,3733", "Расчётный ток25,455 А", "Статус выбора вводного автоматаНедостаточно данных"]);
await calculate("nagruzka-vvoda-doma.html", { faza: "3", u: "380", p_light: "2", k_light: "1", p_sock: "10", k_sock: "0,3", p_pow: "9", k_pow: "0,6", p_heat: "12", k_heat: "1", ko: "0,9", cos: "0,95" }, ["Сумма расчётных мощностей групп22,4 кВт", "Расчётная мощность ввода Pр20,16 кВт", "Итоговый коэффициент Pр / Pуст0,6109", "Расчётный ток на фазу32,242 А", "Статус выбора вводного автоматаНедостаточно данных"]);
await calculate("nagruzka-vvoda-doma.html", { p_light: "1", p_sock: "2" }, ["Установленная мощность3 кВт", "Расчётная мощность ввода Pр3 кВт", "Итоговый коэффициент Pр / Pуст1", "Расчётный ток13,636 А"]);
await calculate("nagruzka-vvoda-doma.html", { p_light: "1", k_light: "1", p_sock: "8", k_sock: "0,2", p_pow: "6", k_pow: "0,5", p_razr: "5" }, ["Сравнение с разрешённой мощностьюПревышает 5 кВт на 0,6 кВт"], "boundary");
await calculate("nagruzka-vvoda-doma.html", { p_light: "1", k_light: "1", p_sock: "8", k_sock: "0,2", p_pow: "6", k_pow: "0,5", p_razr: "5,6" }, ["Сравнение с разрешённой мощностьюНе превышает 5,6 кВт"], "boundary");
await calculate("nagruzka-vvoda-doma.html", { p_sock: "8", k_sock: "1,2" }, ["Коэффициент спроса группы «Розетки общего назначения» задаётся в диапазоне от 0 до 1"], "boundary");
await calculate("nagruzka-vvoda-doma.html", { p_light: "1", ko: "0" }, ["Коэффициент одновременности задаётся в диапазоне от 0 до 1"], "boundary");
await calculate("nagruzka-vvoda-doma.html", {}, ["Введите установленную мощность хотя бы одной группы"], "boundary");
await calculate("nagruzka-vvoda-doma.html", { p_light: "1", p_razr: "abc" }, ["Разрешённая мощность должна быть числом"], "boundary");

await calculate("udlinitel-na-katushke.html", { sost: "wound", p: "1500", pw: "1000", pu: "3500" }, ["Нагрузка1500 Вт", "Смотанный кабель по маркировке этой катушки28,6 % от размотанного", "Применённый предел1000 Вт — значение для смотанного кабеля", "Загрузка относительно предела150 %", "Сравнение с маркировкойПревышает"]);
await calculate("udlinitel-na-katushke.html", { sost: "full", p: "3000", pw: "1000", pu: "3500" }, ["Применённый предел3500 Вт — значение для размотанного кабеля", "Загрузка относительно предела85,71 %", "Сравнение с маркировкойНе превышает"]);
await calculate("udlinitel-na-katushke.html", { sost: "part", p: "900", pw: "1000", pu: "3500" }, ["частично смотанный оценивается как смотанный", "Загрузка относительно предела90 %", "Сравнение с маркировкойНе превышает"]);
await calculate("udlinitel-na-katushke.html", { sost: "part", p: "1200", pw: "1000", pu: "3500" }, ["Сравнение с маркировкойПревышает"], "boundary");
await calculate("udlinitel-na-katushke.html", { sost: "wound", p: "1000", pw: "1000", pu: "3500" }, ["Загрузка относительно предела100 %", "Сравнение с маркировкойНе превышает"], "boundary");
await calculate("udlinitel-na-katushke.html", { sost: "wound", p: "1500", pw: "", pu: "3500" }, ["СтатусНедостаточно данных", "от 23 до 50 %"], "boundary");
await calculate("udlinitel-na-katushke.html", { sost: "full", p: "800", pw: "1000", pu: "" }, ["Применённый предел1000 Вт — значение для смотанного кабеля: размотанный выдерживает не меньше", "Сравнение с маркировкойНе превышает"], "boundary");
await calculate("udlinitel-na-katushke.html", { sost: "full", p: "1200", pw: "1000", pu: "" }, ["СтатусНедостаточно данных"], "boundary");
await calculate("udlinitel-na-katushke.html", { sost: "full", p: "1,5", p_unit: "1000", pw: "1000", pu: "3500" }, ["Нагрузка1500 Вт", "Загрузка относительно предела42,86 %"]);
await calculate("udlinitel-na-katushke.html", { sost: "wound", p: "500", pw: "4000", pu: "3500" }, ["не может выдерживать больше"], "boundary");
await calculate("udlinitel-na-katushke.html", { sost: "wound", p: "0", pw: "1000", pu: "3500" }, ["Мощность нагрузки должна быть больше нуля"], "boundary");
await calculate("udlinitel-na-katushke.html", { sost: "wound", p: "500", pw: "abc", pu: "3500" }, ["Мощность для смотанного кабеля должна быть положительным числом"], "boundary");

await calculate("soprotivlenie-izolyacii.html", { norm: "gost-500", ui: "500", r: "1" }, ["ДокументГОСТ Р 50571.16-2019, табл. 6.1", "Минимум для цепи до 500 В включительно1 МОм при 500 В", "Показание1 МОм при 500 В", "Сравнение с минимумомНе ниже минимума", "СтатусСоответствует минимуму ГОСТ Р 50571.16-2019, табл. 6.1 при данных условиях измерения"], "boundary");
await calculate("soprotivlenie-izolyacii.html", { norm: "gost-500", ui: "500", r: "0,99" }, ["Показание990 кОм при 500 В", "Сравнение с минимумомНиже минимума", "СтатусНе соответствует минимуму ГОСТ Р 50571.16-2019, табл. 6.1 при данных условиях измерения"], "boundary");
await calculate("soprotivlenie-izolyacii.html", { norm: "pue", ui: "1000", r: "0,5" }, ["Минимум для электропроводки0,5 МОм при 1000 В", "Сравнение с минимумомНе ниже минимума", "СтатусСоответствует минимуму ПУЭ, табл. 1.8.34 при данных условиях измерения"], "boundary");
await calculate("soprotivlenie-izolyacii.html", { norm: "pue", ui: "1000", r: "0,49" }, ["Сравнение с минимумомНиже минимума"], "boundary");
await calculate("soprotivlenie-izolyacii.html", { norm: "pue", ui: "500", r: "100" }, ["Испытательное напряжение500 В вместо требуемых 1000 В", "СтатусНедостаточно данных"]);
await calculate("soprotivlenie-izolyacii.html", { norm: "gost-spd", ui: "250", r: "0,9" }, ["Минимум для цепи до 500 В с неотключаемым УЗИП1 МОм при 250 В", "Сравнение с минимумомНиже минимума"]);
await calculate("soprotivlenie-izolyacii.html", { norm: "gost-selv", ui: "250", r: "0,5" }, ["Минимум для цепи БСНН или ЗСНН0,5 МОм при 250 В", "Сравнение с минимумомНе ниже минимума"], "boundary");
await calculate("soprotivlenie-izolyacii.html", { norm: "gost-1000", ui: "1000", r: "5" }, ["Минимум для цепи свыше 500 В1 МОм при 1000 В", "Отношение показания к минимуму5", "Сравнение с минимумомНе ниже минимума"]);
await calculate("soprotivlenie-izolyacii.html", { norm: "gost-500", ui: "500", r: "800", r_unit: "0.001" }, ["Показание800 кОм при 500 В", "Сравнение с минимумомНиже минимума"]);
await calculate("soprotivlenie-izolyacii.html", { norm: "gost-500", ui: "500", r: "2", r_unit: "1000" }, ["Показание2 ГОм при 500 В", "Отношение показания к минимуму2000", "Сравнение с минимумомНе ниже минимума"]);
await calculate("soprotivlenie-izolyacii.html", { norm: "gost-500", ui: "1000", r: "50" }, ["Испытательное напряжение1000 В вместо требуемых 500 В", "СтатусНедостаточно данных"]);
await calculate("soprotivlenie-izolyacii.html", { norm: "gost-500", ui: "500", r: "0" }, ["Показание должно быть больше нуля"], "boundary");
await calculate("soprotivlenie-izolyacii.html", { norm: "gost-500", ui: "500", r: "-5" }, ["Показание должно быть больше нуля"], "boundary");

await calculate("rozetochnaya-gruppa.html", { tip: "rozetki", inom: "16", u: "220", cos: "1", p1: "2000", p2: "1200" }, ["Суммарная одновременная мощность3200 Вт", "Расчётный ток IB14,55 А", "Номинал автомата In16 А", "Загрузка от номинала90,91 %", "Условие IB ≤ InВыполняется", "Запас до номинала320 Вт", "одновременно включённые приборы не превышают номинал автомата"]);
await calculate("rozetochnaya-gruppa.html", { tip: "rozetki", inom: "16", u: "220", cos: "1", p1: "2000", p2: "1200", p3: "800" }, ["Расчётный ток IB18,18 А", "Загрузка от номинала113,6 %", "Условие IB ≤ InНе выполняется", "Превышение номинала480 Вт", "Одновременно включённые приборы превышают номинал автомата"]);
await calculate("rozetochnaya-gruppa.html", { tip: "rozetki", inom: "16", u: "220", cos: "1", p1: "3520" }, ["Расчётный ток IB16 А", "Загрузка от номинала100 %", "Условие IB ≤ InВыполняется", "Запас до номинала0 Вт"], "boundary");
await calculate("rozetochnaya-gruppa.html", { tip: "rozetki", inom: "16", u: "230", cos: "0,8", p1: "2944" }, ["Расчётный ток IB16 А", "Условие IB ≤ InВыполняется", "Запас до номинала0 Вт"], "boundary");
await calculate("rozetochnaya-gruppa.html", { tip: "rozetki", inom: "16", u: "230", cos: "0,8", p1: "2945" }, ["Условие IB ≤ InНе выполняется", "Превышение номинала1 Вт"], "boundary");
await calculate("rozetochnaya-gruppa.html", { tip: "svet", inom: "10", u: "220", cos: "1", p1: "500", nl: "12", nr: "8" }, ["Расчётный ток IB2,273 А", "Ламп и розеток на фазу20 шт.", "Ограничение ПУЭ 6.2.10Не более 20 — соблюдено"], "boundary");
await calculate("rozetochnaya-gruppa.html", { tip: "svet", inom: "10", u: "220", cos: "1", p1: "500", nl: "12", nr: "9" }, ["Ламп и розеток на фазу21 шт.", "Ограничение ПУЭ 6.2.10Больше 20 — превышено ограничение, заданное «как правило»"], "boundary");
await calculate("rozetochnaya-gruppa.html", { tip: "rozetki", inom: "16", u: "220", cos: "1", p1: "2000", nl: "мусор", nr: "мусор" }, ["Условие IB ≤ InВыполняется"]);
await calculate("rozetochnaya-gruppa.html", { tip: "svet", inom: "10", u: "220", cos: "1", p1: "500", nl: "12", nr: "2,5" }, ["целые неотрицательные числа"], "boundary");
await calculate("rozetochnaya-gruppa.html", { p1: "-100" }, ["не может быть отрицательной"], "boundary");
await calculate("rozetochnaya-gruppa.html", { p1: "", p2: "" }, ["Введите мощность хотя бы одного прибора"], "boundary");
await calculate("rozetochnaya-gruppa.html", { p1: "1000", cos: "1,2" }, ["cos φ должен быть в диапазоне от 0 до 1"], "boundary");

// ===========================================================================
// Партия №2: 8 новых калькуляторов «Заземление и защита» (data_k.py и
// data_l.py). Два параллельных агента, затем сверка при интеграции и
// независимая проверка — детали в ENGINEERING_AUDIT.md. Ниже их сценарии
// как есть: сначала data_k.py, затем data_l.py.
// ===========================================================================

// --- data_k.py (партия №2): система TT, горизонтальный и вертикальный
// заземлители, первое замыкание в системе IT. Ожидаемые значения посчитаны
// отдельно от кода страниц (scratchpad batch2_k/expected_k.py, с правилами
// округления fmt) и сверены вручную; погрешность формул заземлителей —
// численным расчётом (mom2_lib.py, domain_check_n320.py). ---

// Система TT. Эталон 1 — таблица 41.5 BS 7671: 1667 Ом для 30 мА.
// Эталон 2 — пример Schneider EIG: при RA = 20 Ом допустимо IΔn ≤ 50/20 = 2,5 А.
await calculate("zazemlenie-tt-uzo.html", {}, ["при токе IΔn: RA·IΔn0,9 В", "Наибольшее допустимое RA = 50 В / IΔn1667 Ом", "Наибольший допустимый IΔn при этом RA = 50 В / RA1,667 А", "Запас RA,max / RA55,56", "СтатусНедостаточно данных: RA измерено без сезонной поправки", "может вырасти в 55,6 раза"]);
await calculate("zazemlenie-tt-uzo.html", { idn: "0.3", ra: "20", rasrc: "worst" }, ["RA·IΔn6 В", "RA = 50 В / IΔn166,7 Ом", "IΔn при этом RA = 50 В / RA2,5 А", "Запас RA,max / RA8,333", "СтатусУсловие RA·IΔn ≤ 50 В выполняется"]);
await calculate("zazemlenie-tt-uzo.html", { idn: "0.3", ra: "200", rasrc: "worst" }, ["RA·IΔn60 В", "IΔn при этом RA = 50 В / RA250 мА", "Превышение RA / RA,max1,2", "СтатусУсловие RA·IΔn ≤ 50 В не выполняется"]);
await calculate("zazemlenie-tt-uzo.html", { idn: "0.01", ra: "4000", rasrc: "worst" }, ["RA = 50 В / IΔn5000 Ом", "RA·IΔn40 В", "СтатусУсловие RA·IΔn ≤ 50 В выполняется"]);
await calculate("zazemlenie-tt-uzo.html", { ra: "45" }, ["RA·IΔn1,35 В", "Запас RA,max / RA37,04", "может вырасти в 37 раз", "СтатусНедостаточно данных"]);
// Граница включается: 50 В — «выполняется», чуть больше — «не выполняется»,
// и число на границе не округляется до ровно 50 В.
await calculate("zazemlenie-tt-uzo.html", { idn: "1", ra: "50", rasrc: "worst" }, ["RA·IΔn50 В", "RA = 50 В / IΔn50 Ом", "СтатусУсловие RA·IΔn ≤ 50 В выполняется"], "boundary");
await calculate("zazemlenie-tt-uzo.html", { idn: "0.5", ra: "100", rasrc: "worst" }, ["RA = 50 В / IΔn100 Ом", "RA·IΔn50 В", "СтатусУсловие RA·IΔn ≤ 50 В выполняется"], "boundary");
await calculate("zazemlenie-tt-uzo.html", { idn: "0.1", ra: "500", rasrc: "worst" }, ["RA·IΔn50 В", "Запас RA,max / RA1", "СтатусУсловие RA·IΔn ≤ 50 В выполняется"], "boundary");
await calculate("zazemlenie-tt-uzo.html", { idn: "0.1", ra: "500,01", rasrc: "worst" }, ["RA·IΔn50,001 В", "Превышение RA / RA,max1,00002", "СтатусУсловие RA·IΔn ≤ 50 В не выполняется"], "boundary");
await calculate("zazemlenie-tt-uzo.html", { ra: "1666,66", rasrc: "worst" }, ["RA·IΔn49,9998 В", "СтатусУсловие RA·IΔn ≤ 50 В выполняется"], "boundary");
await calculate("zazemlenie-tt-uzo.html", { ra: "1666,67", rasrc: "worst" }, ["RA·IΔn50,0001 В", "СтатусУсловие RA·IΔn ≤ 50 В не выполняется"], "boundary");
// Замер без сезонной поправки: превышение — вывод есть (в худший сезон RA
// не меньше), запас — вывода нет, даже ровно на границе.
await calculate("zazemlenie-tt-uzo.html", { ra: "2000" }, ["RA·IΔn60 В", "СтатусУсловие RA·IΔn ≤ 50 В не выполняется", "Уже по замеру"]);
await calculate("zazemlenie-tt-uzo.html", { idn: "0.1", ra: "500" }, ["RA·IΔn50 В", "СтатусНедостаточно данных: RA измерено без сезонной поправки", "RA уже на пределе"], "boundary");
await calculate("zazemlenie-tt-uzo.html", { dev: "ocpd", ra: "не-число" }, ["СтатусНедостаточно данных: для автомата или предохранителя условие RA·IΔn неприменимо", "ПУЭ 1.7.59", "411.5.2"]);
await invalid("zazemlenie-tt-uzo.html", { ra: "0" }, "Сопротивление RA должно быть больше нуля");
await invalid("zazemlenie-tt-uzo.html", { ra: "-30" }, "Сопротивление RA должно быть больше нуля");
await invalid("zazemlenie-tt-uzo.html", { ra: "30 Ом" }, "Введите сопротивление RA");
await invalid("zazemlenie-tt-uzo.html", { ra: "1e-320" }, "вне диапазона надёжного расчёта");

// Горизонтальный заземлитель: формула volt-spb/Барыбина ρ/(2πL)·ln(L²/(d·t)).
// Эталон 1: полоса 40 мм (d = 20 мм), L = 10 м, t = 0,7 м: 1,59155·ln 7142,9 = 14,12 Ом
// (численный расчёт 13,22 Ом — формула с запасом). Эталон 2: пруток 10 мм,
// L = 20 м, t = 0,5 м: 0,79577·ln 80000 = 8,984 Ом (численный расчёт 8,467 Ом).
await calculate("gorizontalnyy-zazemlitel.html", {}, ["Эквивалентный диаметр d20 мм (0,5·b)", "R = ρ/(2πL)·ln(L²/(d·t))14,12 Ом", "завышает R на 3,3–8,5 %", "Сравнение с целью14,12 Ом — выше заданной цели уже при этом ρ", "СтатусОценка, требуется измерение", "Даже без сезонной поправки оценка выше цели"]);
await calculate("gorizontalnyy-zazemlitel.html", { prof: "round", d: "10", l: "20", t: "0,5", rhosrc: "worst" }, ["Эквивалентный диаметр d10 мм", "R = ρ/(2πL)·ln(L²/(d·t))8,984 Ом", "Сравнение с целью8,984 Ом — не выше заданной цели", "СтатусОценка, требуется измерение"]);
await calculate("gorizontalnyy-zazemlitel.html", { rho: "3000", rhosrc: "worst" }, ["R = ρ/(2πL)·ln(L²/(d·t))423,7 Ом", "Сравнение с целью423,7 Ом — выше заданной цели", "СтатусОценка, требуется измерение"]);
await calculate("gorizontalnyy-zazemlitel.html", { prof: "round", d: "10", l: "20", t: "0,5", rt: "9" }, ["8,984 Ом — не выше цели при этом ρ, но в сухой или морозный сезон ρ выше", "до цели ρ может вырасти в 1,002 раза", "СтатусНедостаточно данных: ρ без сезонной поправки"]);
await calculate("gorizontalnyy-zazemlitel.html", { prof: "round", d: "10", l: "20", t: "0,5", rt: "8,985", rhosrc: "worst" }, ["8,984 Ом — не выше заданной цели"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { prof: "round", d: "10", l: "20", t: "0,5", rt: "8,984", rhosrc: "worst" }, ["8,9841 Ом — выше заданной цели"], "boundary");
// Область применимости: при L < 5·t формула перестаёт давать запас
// (численно: L = 2·t — занижение до 2,1 %, L = 1,5·t — до 8 %).
await calculate("gorizontalnyy-zazemlitel.html", { l: "3,5" }, ["R = ρ/(2πL)·ln(L²/(d·t))30,8 Ом"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { l: "3,49" }, ["Длина меньше 5·t = 3,5 м", "занижает"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { prof: "round", d: "16", l: "100", t: "1", rhosrc: "worst" }, ["R = ρ/(2πL)·ln(L²/(d·t))2,124 Ом", "не выше заданной цели"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { l: "100,01", t: "1" }, ["Длина больше 100 м"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { prof: "round", d: "5", l: "1,5", t: "0,3", rt: "100" }, ["Эквивалентный диаметр d5 мм", "R = ρ/(2πL)·ln(L²/(d·t))77,6 Ом"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { prof: "round", d: "4,99", l: "1,5", t: "0,3" }, ["Диаметр вне проверенной области 5–30 мм"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { prof: "round", d: "30,01" }, ["Диаметр вне проверенной области 5–30 мм"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { b: "60", l: "10", t: "2" }, ["Эквивалентный диаметр d30 мм (0,5·b)", "R = ρ/(2πL)·ln(L²/(d·t))11,81 Ом"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { b: "60,01" }, ["Ширина полосы вне проверенной области 10–60 мм"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { b: "9,99" }, ["Ширина полосы вне проверенной области 10–60 мм"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { t: "0,29", l: "5" }, ["Глубина укладки вне проверенной области 0,3–2 м"], "boundary");
await calculate("gorizontalnyy-zazemlitel.html", { t: "2,01", l: "20" }, ["Глубина укладки вне проверенной области 0,3–2 м"], "boundary");
await invalid("gorizontalnyy-zazemlitel.html", { rho: "0" }, "Все значения должны быть больше нуля");
await invalid("gorizontalnyy-zazemlitel.html", { rt: "-10" }, "Все значения должны быть больше нуля");
await invalid("gorizontalnyy-zazemlitel.html", { l: "десять" }, "Заполните ρ, размер проводника");

// Вертикальный заземлитель. Эталон 1: стержень 16 мм, L = 3 м, t0 = 0,5 м:
// T = 2 м, 5,3052·(ln 375 + ½·ln 2,2) = 33,53 Ом (численный расчёт 31,74 Ом).
// Эталон 2 — пример из выдачи: уголок 50 мм длиной 2,5 м, верх на 0,7 м:
// d = 0,0475 м, t = 1,95 м → 31,76 Ом. Эталон 3 — формула Дуайта (BS 7430)
// для стержня от поверхности: 5,3052·(ln 1500 − 1) = 33,49 Ом.
await calculate("vertikalnyy-zazemlitel.html", {}, ["Эквивалентный диаметр d16 мм", "Глубина середины электрода T = t₀ + L/22 м", "Оценочное сопротивление R33,53 Ом", "Для сравнения: грубая оценка ρ/L33,33 Ом", "завышает R на 2,4–11,7 %", "Сравнение с целью33,53 Ом — выше заданной цели уже при этом ρ", "СтатусОценка, требуется измерение", "Даже без сезонной поправки оценка выше цели"]);
await calculate("vertikalnyy-zazemlitel.html", { prof: "angle", b: "50", l: "2,5", t0: "0,7", rt: "40", rhosrc: "worst" }, ["Эквивалентный диаметр d47,5 мм (0,95·b)", "T = t₀ + L/21,95 м", "Оценочное сопротивление R31,76 Ом", "грубая оценка ρ/L40 Ом", "Сравнение с целью31,76 Ом — не выше заданной цели", "СтатусОценка, требуется измерение", "0,92–0,946·b"]);
await calculate("vertikalnyy-zazemlitel.html", { t0: "0" }, ["T = t₀ + L/21,5 м", "Оценочное сопротивление R34,36 Ом", "По формуле Дуайта для стержня от поверхности (BS 7430)33,49 Ом", "Расхождение двух формул2,58 %", "формула Дуайта — на 0,4–2,2 %"]);
await calculate("vertikalnyy-zazemlitel.html", { prof: "strip", b: "40", l: "2", t0: "0,5", rt: "50", rhosrc: "worst" }, ["Эквивалентный диаметр d20 мм (0,5·b)", "Оценочное сопротивление R44,92 Ом", "грубая оценка ρ/L50 Ом", "не выше заданной цели", "эквивалентный диаметр больше 0,5·b"]);
await calculate("vertikalnyy-zazemlitel.html", { rt: "34" }, ["33,53 Ом — не выше цели при этом ρ", "до цели ρ может вырасти в 1,01 раза", "СтатусНедостаточно данных: ρ без сезонной поправки"]);
await calculate("vertikalnyy-zazemlitel.html", { rt: "33,54", rhosrc: "worst" }, ["33,53 Ом — не выше заданной цели"], "boundary");
await calculate("vertikalnyy-zazemlitel.html", { rt: "33,53", rhosrc: "worst" }, ["33,535 Ом — выше заданной цели"], "boundary");
await calculate("vertikalnyy-zazemlitel.html", { d: "8", l: "1", t0: "0", rt: "100" }, ["Оценочное сопротивление R96,62 Ом", "(BS 7430)94,02 Ом", "Расхождение двух формул2,76 %"], "boundary");
await calculate("vertikalnyy-zazemlitel.html", { d: "7,99" }, ["Эквивалентный диаметр d = 7,99 мм вне проверенной области 8–60 мм"], "boundary");
await calculate("vertikalnyy-zazemlitel.html", { d: "60", l: "10", t0: "2" }, ["Оценочное сопротивление R9,84 Ом", "T = t₀ + L/27 м"], "boundary");
await calculate("vertikalnyy-zazemlitel.html", { d: "60,01" }, ["вне проверенной области 8–60 мм"], "boundary");
await calculate("vertikalnyy-zazemlitel.html", { prof: "angle", b: "63,16" }, ["Эквивалентный диаметр d = 60,002 мм вне проверенной области 8–60 мм"], "boundary");
// Коэффициент 0,95 проверен для уголков 40–63 мм (замечание бота-ревьюера): уже 40 мм — вне области.
// Эталон на границе: b = 40 → d = 38 мм, T = 2 м: 5,3052·(ln(6/0,038) + ½·ln 2,2) = 28,95 Ом.
await calculate("vertikalnyy-zazemlitel.html", { prof: "angle", b: "40" }, ["Эквивалентный диаметр d38 мм (0,95·b)", "Оценочное сопротивление R28,95 Ом"], "boundary");
await calculate("vertikalnyy-zazemlitel.html", { prof: "angle", b: "39,99" }, ["Ширина полки уголка меньше 40 мм — вне проверенной области"], "boundary");
await calculate("vertikalnyy-zazemlitel.html", { prof: "angle", b: "10" }, ["Ширина полки уголка меньше 40 мм"], "boundary");
await calculate("vertikalnyy-zazemlitel.html", { l: "0,99" }, ["Длина электрода вне проверенной области 1–10 м"], "boundary");
await calculate("vertikalnyy-zazemlitel.html", { l: "10,01" }, ["Длина электрода вне проверенной области 1–10 м"], "boundary");
await calculate("vertikalnyy-zazemlitel.html", { t0: "2,01" }, ["Заглубление верхнего конца больше 2 м"], "boundary");
await invalid("vertikalnyy-zazemlitel.html", { t0: "-0,01" }, "Заглубление верхнего конца не может быть отрицательным");
await invalid("vertikalnyy-zazemlitel.html", { rho: "-100" }, "должны быть больше нуля");
await invalid("vertikalnyy-zazemlitel.html", { d: "16мм" }, "Заполните ρ, размер электрода");

// Система IT. Эталон 1: ток в месте замыкания равен утроенному ёмкостному
// току фазы: 3·314,16·10⁻⁶·220 = 0,2073 А. Эталон 2 — пример Schneider EIG:
// 3500 Ом на фазу при 230 В — 66 мА в норме, 66·√3 ≈ 114 мА в неповреждённых
// фазах, сумма ≈ 197 мА; C = 1/(ω·3500) = 0,90946 мкФ → 3·230/3500 = 197,1 мА.
await calculate("zamykanie-na-zemlyu-it.html", {}, ["Id ≈ 3·ω·C·U₀207,3 мА", "Ёмкостное сопротивление сети 1/(3·ω·C)1061 Ом", "RA·Id2,073 В", "RA = 50 В / Id241,1 Ом", "Запас RA,max / RA24,11", "Сравнение с 50 В по оценкене выше 50 В", "СтатусОценка, требуется измерение"]);
await calculate("zamykanie-na-zemlyu-it.html", { c: "0,90946", u0: "230" }, ["Id ≈ 3·ω·C·U₀197,1 мА", "RA·Id1,971 В"]);
await calculate("zamykanie-na-zemlyu-it.html", { wires: "4" }, ["Id ≈ 4·ω·C·U₀276,5 мА", "1/(4·ω·C)795,8 Ом", "RA·Id2,765 В"]);
await calculate("zamykanie-na-zemlyu-it.html", { c: "1000", c_unit: "1e-09" }, ["Id ≈ 3·ω·C·U₀207,3 мА"]);
await calculate("zamykanie-na-zemlyu-it.html", { c: "10", ra: "30" }, ["Id ≈ 3·ω·C·U₀2,073 А", "RA·Id62,2 В", "Сравнение с 50 В по оценкевыше 50 В", "СтатусОценка, требуется измерение", "RA составляет 28,3 % ёмкостного сопротивления"]);
await calculate("zamykanie-na-zemlyu-it.html", { ra: "318,3" }, ["RA·Id66 В", "RA составляет 30 %", "СтатусОценка, требуется измерение"], "boundary");
await calculate("zamykanie-na-zemlyu-it.html", { ra: "318,4" }, ["RA больше 0,3 ёмкостного сопротивления сети 1/(3·ω·C) = 1061 Ом"], "boundary");
await calculate("zamykanie-na-zemlyu-it.html", { u0: "577" }, ["Id ≈ 3·ω·C·U₀543,8 мА"], "boundary");
await calculate("zamykanie-na-zemlyu-it.html", { u0: "578" }, ["U₀ больше 577 В"], "boundary");
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", rasrc: "worst", pist: "le100" }, ["Ток первого замыкания Id200 мА", "RA·Id2 В", "RA = 50 В / Id250 Ом", "Запас RA,max / RA25", "СтатусУсловие RA·Id ≤ 50 В выполняется"]);
// Граница 50 В при RA не больше 4 Ом, чтобы вывод не зависел от оговорок ПУЭ 1.7.104: 12,5 А · 4 Ом = 50 В.
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "12,5", id_unit: "1", ra: "4", rasrc: "worst" }, ["RA·Id50 В", "RA = 50 В / Id4 Ом", "СтатусУсловие RA·Id ≤ 50 В выполняется"], "boundary");
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "500", ra: "100,01", rasrc: "worst" }, ["RA·Id50,01 В", "Превышение RA / RA,max1,0001", "СтатусУсловие RA·Id ≤ 50 В не выполняется"], "boundary");
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "measured", id: "200", rasrc: "worst" }, ["СтатусНедостаточно данных: Id измерен при текущей конфигурации сети", "может вырасти в 25 раз"]);
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200" }, ["СтатусНедостаточно данных: RA измерено без сезонной поправки"]);
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "measured", id: "200" }, ["СтатусНедостаточно данных: Id измерен при текущей конфигурации сети; RA измерено без сезонной поправки"]);
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "measured", id: "500", ra: "100" }, ["RA·Id50 В", "СтатусНедостаточно данных", "Значение уже на пределе"], "boundary");
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "measured", id: "1", id_unit: "1", ra: "60" }, ["Ток первого замыкания Id1 А", "RA·Id60 В", "СтатусУсловие RA·Id ≤ 50 В не выполняется", "Уже по этим данным"]);
// Оговорки ПУЭ 1.7.104 — цитатой с условиями и без вердикта по ним.
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "20", id_unit: "1", ra: "2", rasrc: "worst" }, ["RA = 50 В / Id2,5 Ом", "СтатусУсловие RA·Id ≤ 50 В выполняется", "«Как правило, не требуется принимать значение сопротивления заземляющего устройства менее 4 Ом»"]);
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "8", rasrc: "worst" }, ["RA больше 4 Ом", "до 10 Ом", "не превышает 100 кВ·А, в том числе суммарная мощность работающих параллельно"]);
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "12", rasrc: "worst" }, ["RA больше 10 Ом", "о большем значении пункт не говорит"]);
await invalid("zamykanie-na-zemlyu-it.html", { ra: "0" }, "Сопротивление RA должно быть больше нуля");
await invalid("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "-5" }, "Ток Id должен быть больше нуля");
await invalid("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "" }, "Введите ток первого замыкания Id");
await invalid("zamykanie-na-zemlyu-it.html", { c: "0" }, "Ёмкость и напряжение должны быть больше нуля");
await invalid("zamykanie-na-zemlyu-it.html", { u0: "220 В" }, "Введите ёмкость проводника");

// Рискованный вердикт отдельно: «выполняется» не выдаётся ни по замеру без
// поправки, ни по оценке через ёмкость; по оценке нет и «не выполняется».
{
  const verdictOf = async (file, values) => {
    kind = "boundary"; recordScenario(file);
    const dom = await load(file); setValues(dom.window.document, values);
    dom.window.document.getElementById("go").click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    const res = dom.window.document.getElementById("res").textContent.replace(/\s+/g, " ");
    dom.window.close();
    return res;
  };
  for (const values of [{}, { ra: "1" }, { idn: "1", ra: "0,5" }, { idn: "0.1", ra: "500" }]) {
    const res = await verdictOf("zazemlenie-tt-uzo.html", values);
    check(!/Условие RA·IΔn ≤ 50 В выполняется/.test(res) && /Недостаточно данных/.test(res),
      `zazemlenie-tt-uzo: по RA без сезонной поправки выдан вывод «выполняется» (${JSON.stringify(values)})`);
  }
  for (const values of [{}, { c: "10", ra: "30" }, { c: "0,01", ra: "1", rasrc: "worst" }, { wires: "4", c: "5", ra: "40" }]) {
    const res = await verdictOf("zamykanie-na-zemlyu-it.html", values);
    check(!/Условие RA·Id ≤ 50 В (не )?выполняется/.test(res) && /Оценка, требуется измерение/.test(res),
      `zamykanie-na-zemlyu-it: по оценке через ёмкость выдан нормативный вердикт (${JSON.stringify(values)})`);
  }
  for (const values of [{ idmode: "measured", id: "1", ra: "1", rasrc: "worst" }, { idmode: "design", id: "1", ra: "1" }]) {
    const res = await verdictOf("zamykanie-na-zemlyu-it.html", values);
    check(!/Условие RA·Id ≤ 50 В выполняется/.test(res) && /Недостаточно данных/.test(res),
      `zamykanie-na-zemlyu-it: по измеренному Id или RA без поправки выдан вывод «выполняется» (${JSON.stringify(values)})`);
  }
  for (const [file, values] of [
    ["gorizontalnyy-zazemlitel.html", { rt: "100" }], ["vertikalnyy-zazemlitel.html", { rt: "100" }],
  ]) {
    const res = await verdictOf(file, values);
    check(/Недостаточно данных: ρ без сезонной поправки/.test(res) && /в сухой или морозный сезон ρ выше/.test(res) && !/— не выше заданной цели/.test(res),
      `${file}: по ρ без сезонной поправки выдано безоговорочное «не выше заданной цели»`);
  }
  for (const [file, values] of [
    ["gorizontalnyy-zazemlitel.html", { l: "1,4" }], ["gorizontalnyy-zazemlitel.html", { l: "2,8" }],
    ["vertikalnyy-zazemlitel.html", { l: "0,5" }],
  ]) {
    const res = await verdictOf(file, values);
    check(!/Оценочное сопротивление/.test(res) && !/Статус/.test(res),
      `${file}: вне проверенной области формулы выдана оценка (${JSON.stringify(values)})`);
  }
}

// Структура: переключатели скрывают неприменимые поля, тексты держат
// атрибуцию и цитаты, запрещённых формулировок статуса нет.
{
  kind = "structural";
  const visible = (document, id) => document.getElementById(`f_${id}`).style.display !== "none";
  const flip = (dom, id, value) => {
    const el = dom.window.document.getElementById(id);
    el.value = value; el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  };
  let dom = await load("zazemlenie-tt-uzo.html");
  check(visible(dom.window.document, "idn") && visible(dom.window.document, "ra"), "zazemlenie-tt-uzo: в режиме УЗО поля IΔn и RA должны быть видны");
  flip(dom, "dev", "ocpd");
  check(!visible(dom.window.document, "idn") && !visible(dom.window.document, "ra") && !visible(dom.window.document, "rasrc"), "zazemlenie-tt-uzo: в режиме автомата поля RA·IΔn должны быть скрыты");
  dom.window.close();
  dom = await load("gorizontalnyy-zazemlitel.html");
  check(visible(dom.window.document, "b") && !visible(dom.window.document, "d"), "gorizontalnyy-zazemlitel: для полосы должно быть видно только поле b");
  flip(dom, "prof", "round");
  check(!visible(dom.window.document, "b") && visible(dom.window.document, "d"), "gorizontalnyy-zazemlitel: для прутка должно быть видно только поле d");
  dom.window.close();
  dom = await load("vertikalnyy-zazemlitel.html");
  check(visible(dom.window.document, "d") && !visible(dom.window.document, "b"), "vertikalnyy-zazemlitel: для стержня должно быть видно только поле d");
  flip(dom, "prof", "angle");
  check(!visible(dom.window.document, "d") && visible(dom.window.document, "b"), "vertikalnyy-zazemlitel: для уголка должно быть видно только поле b");
  dom.window.close();
  dom = await load("zamykanie-na-zemlyu-it.html");
  check(!visible(dom.window.document, "id") && visible(dom.window.document, "c") && visible(dom.window.document, "wires"), "zamykanie-na-zemlyu-it: в режиме оценки должны быть видны C и проводники, Id скрыт");
  flip(dom, "idmode", "design");
  check(visible(dom.window.document, "id") && !visible(dom.window.document, "c") && !visible(dom.window.document, "wires") && !visible(dom.window.document, "u0"), "zamykanie-na-zemlyu-it: в режиме проекта должен быть виден только Id");
  dom.window.close();

  const text = file => fs.readFileSync(path.join(sourceDir, file), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const script = file => (fs.readFileSync(path.join(sourceDir, file), "utf8").match(/<script>([\s\S]*?)<\/script>\s*<\/body>/) ?? ["", ""])[1];
  for (const file of ["zazemlenie-tt-uzo.html", "gorizontalnyy-zazemlitel.html", "vertikalnyy-zazemlitel.html", "zamykanie-na-zemlyu-it.html"]) {
    check(!/Проходит|Соответствует нормам|[Бб]езопасно(?![а-яё])/.test(script(file)), `${file}: запрещённая формулировка статуса в расчёте`);
  }
  const tt = text("zazemlenie-tt-uzo.html");
  check(/Ia — ток срабатывания защитного устройства/.test(tt) && /наиболее удалённого электроприёмника/.test(tt), "zazemlenie-tt-uzo: определения Ra и Ia ПУЭ 1.7.59 не приведены целиком");
  check(/ГОСТ Р 50571\.4\.41-2022/.test(tt) && /целиком не виден/.test(tt), "zazemlenie-tt-uzo: не сказано, по какой редакции считается и что текст новой редакции не сверен");
  check(/Schneider Electric указывает, что для временных электроустановок/.test(tt), "zazemlenie-tt-uzo: 25 В должно быть приписано Schneider Electric, а не МЭК 60364-7-705");
  check(!/60364-7-705/.test(tt), "zazemlenie-tt-uzo: 25 В приписано МЭК 60364-7-705, хотя в выдаче поиска это не видно");
  const hor = text("gorizontalnyy-zazemlitel.html");
  check(/L ≥ 5·t/.test(hor) && /занижать R/.test(hor) && /численн/.test(hor), "gorizontalnyy-zazemlitel: не показано, где и в какую сторону ошибается формула");
  check(/kolcevoy-zazemlitel\.html/.test(fs.readFileSync(path.join(sourceDir, "gorizontalnyy-zazemlitel.html"), "utf8")), "gorizontalnyy-zazemlitel: нет ссылки на кольцевой заземлитель");
  const ver = text("vertikalnyy-zazemlitel.html");
  check(/0,95/.test(ver) && /0,92–0,946·b/.test(ver) && /BS 7430/.test(ver) && /ρ\/\(n·L\)/.test(ver), "vertikalnyy-zazemlitel: нет проверки коэффициента уголка, формулы Дуайта или сравнения с ρ/(n·L)");
  // Замечание бота-ревьюера к PR #22: текст справочника под ред. Барыбина не сверен, поэтому
  // основание формул — их вывод на странице (потенциал в середине электрода плюс зеркальное
  // изображение) и численная проверка, а ссылка на справочник помечена как несверенная.
  check(hor.includes("ρ/(2π·L)·ln(2L/d)") && hor.includes("ρ/(2π·L)·ln(L/(2t))") && hor.includes("сумма и есть ρ/(2π·L)·ln(L²/(d·t))"),
    "gorizontalnyy-zazemlitel: нет вывода формулы — собственного поля и зеркального изображения");
  check(ver.includes("ρ/(2π·L)·ln(2L/d)") && ver.includes("ρ/(4π·L)·ln((4T + L)/(4T − L))"),
    "vertikalnyy-zazemlitel: нет вывода формулы — собственного поля и зеркального изображения");
  for (const [slug, page] of [["gorizontalnyy-zazemlitel", hor], ["vertikalnyy-zazemlitel", ver]]) {
    check(page.includes("текст самого справочника не сверен") && page.includes("текст справочника не сверен") && page.includes("основание расчёта здесь — вывод формулы и численная проверка"),
      `${slug}: ссылка на справочник Барыбина не помечена как несверенная или не названо основание расчёта`);
    check(!/запись справочника|Справочник даёт|формуле справочника/.test(page),
      `${slug}: формула или коэффициент по-прежнему приписаны несверенному справочнику`);
  }
  const it = text("zamykanie-na-zemlyu-it.html");
  check(it.includes("«Как правило, не требуется принимать значение сопротивления заземляющего устройства менее 4 Ом. Допускается сопротивление заземляющего устройства до 10 Ом, если соблюдено приведенное выше условие, а мощность генераторов или трансформаторов не превышает 100 кВ·А, в том числе суммарная мощность генераторов или трансформаторов, работающих параллельно»"),
    "zamykanie-na-zemlyu-it: оговорки ПУЭ 1.7.104 процитированы неточно");
  check(/411\.6\.3\.1/.test(it) && /411\.6\.4/.test(it) && /не рассчитывает/.test(it), "zamykanie-na-zemlyu-it: не сказано про контроль изоляции и второе замыкание");
  check(/в 4 раза/.test(it) && /Bender/.test(it), "zamykanie-na-zemlyu-it: нет множителя 4 для 3L+N или направления ошибки из-за сопротивления изоляции");
}

// ===========================================================================
// Партия №2, generator/data_l.py: уравнивание потенциалов, двойной
// стержневой молниеотвод, УЗИП на вводе, обрыв PEN. Эталоны посчитаны
// отдельным скриптом (scratchpad batch2_l/ref_values.py) и вручную, а не
// кодом страниц; округление — как в fmt(): 4 значащие цифры, запятая.
// ===========================================================================

// Сценарий с запретом: фрагменты present обязаны быть, absent — нет.
// Нужен для рискованных вердиктов: проверить, что при недостатке данных
// страница не выдаёт «минимум» или «зона есть».
async function calculateWithout(file, values, present, absent, scenarioKind = "functional") {
  kind = scenarioKind; recordScenario(file);
  const dom = await load(file); setValues(dom.window.document, values);
  dom.window.document.getElementById("go").click();
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  const result = dom.window.document.getElementById("res").textContent.replace(/\s+/g, " ").trim();
  for (const fragment of present) check(result.includes(fragment), `${file}: ожидалось «${fragment}», получено «${result}»`);
  for (const fragment of absent) check(!result.includes(fragment), `${file}: при ${JSON.stringify(values)} не должно быть «${fragment}», получено «${result}»`);
  check(!/NaN|Infinity|undefined|·10\^/.test(result), `${file}: NaN/Infinity/экспонента в результате «${result}»`);
  dom.window.close();
}

// --- 17. sechenie-provodnika-uravnivaniya: ПУЭ 1.7.137, 1.7.138, 1.7.127 ---
// Эталон 1 (вручную): наибольший PE 16 мм² Cu → 16/2 = 8 мм², больше 6 и меньше 25 → 8, по ряду 10.
await calculate("sechenie-provodnika-uravnivaniya.html", {}, ["Половина наибольшего PE (ПУЭ 1.7.137)8 мм² меди", "Предел «не более 25 мм² по меди»не достигнут", "Минимум в любом случае (ПУЭ 1.7.137)6 мм² меди", "Определяющее условиеполовина наибольшего PE", "Принять по стандартному ряду10 мм²", "СтатусМинимум по ПУЭ 1.7.137: 8 мм² меди (по ряду — 10 мм²)"]);
// Эталон 2: 95 мм² → 47,5 > 25: больше 25 мм², как правило, не требуется.
await calculate("sechenie-provodnika-uravnivaniya.html", { smax: "95" }, ["Половина наибольшего PE (ПУЭ 1.7.137)47,5 мм² меди", "достигнут: больше 25 мм², как правило, не требуется", "Определяющее условиепредел 25 мм² по меди", "СтатусМинимум по ПУЭ 1.7.137: 25 мм² меди", "«как правило» оставляют проекту право"]);
// Эталон 3: 10 мм² → 5 < 6: минимум в любом случае.
await calculate("sechenie-provodnika-uravnivaniya.html", { smax: "10" }, ["Определяющее условиеминимум в любом случае", "СтатусМинимум по ПУЭ 1.7.137: 6 мм² меди"]);
// Граница минимума 6 мм²: 12 → ровно 6 (оба условия), 12,01 → 6,005 → по ряду 10.
await calculate("sechenie-provodnika-uravnivaniya.html", { smax: "12" }, ["Определяющее условиеполовина наибольшего PE, минимум в любом случае", "Принять по стандартному ряду6 мм²", "СтатусМинимум по ПУЭ 1.7.137: 6 мм² меди"], "boundary");
await calculate("sechenie-provodnika-uravnivaniya.html", { smax: "12,01" }, ["Минимальное сечение6,005 мм² меди", "Принять по стандартному ряду10 мм²", "СтатусМинимум по ПУЭ 1.7.137: 6,005 мм² меди (по ряду — 10 мм²)"], "boundary");
// Граница предела 25 мм²: 50 → ровно 25, предел не достигнут; 50,02 → 25,01, предел достигнут.
await calculate("sechenie-provodnika-uravnivaniya.html", { smax: "50" }, ["Половина наибольшего PE (ПУЭ 1.7.137)25 мм² меди", "Предел «не более 25 мм² по меди»не достигнут", "Определяющее условиеполовина наибольшего PE"], "boundary");
await calculate("sechenie-provodnika-uravnivaniya.html", { smax: "50,02" }, ["Половина наибольшего PE (ПУЭ 1.7.137)25,01 мм² меди", "Предел «не более 25 мм² по меди»достигнут", "Определяющее условиепредел 25 мм² по меди", "СтатусМинимум по ПУЭ 1.7.137: 25 мм² меди"], "boundary");
// Алюминий: 16 мм² → 8 < 16 → минимум 16; половина ровно 25 мм² ещё определена, 25,01 — уже нет.
await calculate("sechenie-provodnika-uravnivaniya.html", { smax: "16", mpe: "al", mb: "al" }, ["Половина наибольшего PE (ПУЭ 1.7.137)8 мм² алюминия", "не достигнут: алюминий проводит хуже меди", "Минимум в любом случае (ПУЭ 1.7.137)16 мм² алюминия", "СтатусМинимум по ПУЭ 1.7.137: 16 мм² алюминия"]);
await calculate("sechenie-provodnika-uravnivaniya.html", { smax: "50", mpe: "al", mb: "al" }, ["СтатусМинимум по ПУЭ 1.7.137: 25 мм² алюминия"], "boundary");
await calculateWithout("sechenie-provodnika-uravnivaniya.html", { smax: "50,02", mpe: "al", mb: "al" }, ["не применён: равноценное сечение алюминия ПУЭ не задаёт", "С запасом, без предела25,01 мм² алюминия; по ряду — 35 мм²", "СтатусНедостаточно данных: равноценное 25 мм² меди сечение алюминия ПУЭ не задаёт; с запасом — 35 мм² алюминия"], ["Минимум по ПУЭ"], "boundary");
// Разные металлы: минимум не выдаётся (рискованный вердикт), только «Недостаточно данных».
await calculateWithout("sechenie-provodnika-uravnivaniya.html", { mb: "fe" }, ["Минимум в любом случае (ПУЭ 1.7.137)50 мм² стали", "По проводимости — не меньше, чем8 мм² меди", "СтатусНедостаточно данных: проводник уравнивания стальной, PE из меди"], ["Минимум по ПУЭ", "Минимальное сечение"]);
await calculateWithout("sechenie-provodnika-uravnivaniya.html", { mpe: "cu", mb: "al" }, ["Минимум в любом случае (ПУЭ 1.7.137)16 мм² алюминия", "СтатусНедостаточно данных: PE медный, проводник уравнивания алюминиевый"], ["Минимум по ПУЭ", "Минимальное сечение"]);
// PE алюминиевый 70 мм², проводник медный: половина 35, по меди предел 25 → с запасом 25 мм² меди.
await calculateWithout("sechenie-provodnika-uravnivaniya.html", { smax: "70", mpe: "al", mb: "cu" }, ["Половина наибольшего PE (ПУЭ 1.7.137)35 мм² алюминия", "С запасом: то же сечение из меди25 мм² меди", "СтатусНедостаточно данных: PE алюминиевый, проводник медный", "с запасом — 25 мм² меди"], ["Минимум по ПУЭ"]);
// Дополнительная система, две открытые части 2,5 и 4 мм² (эталон вручную): меньший PE 2,5; вне кабеля без защиты — 4.
await calculate("sechenie-provodnika-uravnivaniya.html", { sys: "dop2" }, ["Меньшее из сечений PE (ПУЭ 1.7.138)2,5 мм² меди", "Минимум для проводника вне кабеля (ПУЭ 1.7.127)4 мм² меди", "Определяющее условиеминимум 1.7.127", "СтатусМинимум по ПУЭ 1.7.138: 4 мм² меди"]);
await calculate("sechenie-provodnika-uravnivaniya.html", { sys: "dop2", lay: "cab" }, ["не применяется: проводник в составе кабеля", "Определяющее условиеменьший из PE", "СтатусМинимум по ПУЭ 1.7.138: 2,5 мм² меди"]);
await calculate("sechenie-provodnika-uravnivaniya.html", { sys: "dop2", s1: "10", s2: "6", lay: "cab" }, ["Меньшее из сечений PE (ПУЭ 1.7.138)6 мм² меди", "СтатусМинимум по ПУЭ 1.7.138: 6 мм² меди"]);
// Открытая и сторонняя часть, PE 2,5 мм²: половина 1,25; в кабеле → по ряду 1,5; с защитой → 2,5; без → 4.
await calculate("sechenie-provodnika-uravnivaniya.html", { sys: "dop1", lay: "cab" }, ["Половина сечения PE открытой части (ПУЭ 1.7.138)1,25 мм² меди", "Принять по стандартному ряду1,5 мм²", "СтатусМинимум по ПУЭ 1.7.138: 1,25 мм² меди (по ряду — 1,5 мм²)"]);
await calculate("sechenie-provodnika-uravnivaniya.html", { sys: "dop1", lay: "mz" }, ["Минимум для проводника вне кабеля (ПУЭ 1.7.127)2,5 мм² меди", "СтатусМинимум по ПУЭ 1.7.138: 2,5 мм² меди"]);
await calculate("sechenie-provodnika-uravnivaniya.html", { sys: "dop1", lay: "nz" }, ["СтатусМинимум по ПУЭ 1.7.138: 4 мм² меди"]);
// Граница минимума 4 мм² без механической защиты: PE 8 → 4 (оба условия); 8,01 → 4,005 → по ряду 6.
await calculate("sechenie-provodnika-uravnivaniya.html", { sys: "dop1", s1: "8", lay: "nz" }, ["Определяющее условиеполовина PE открытой части, минимум 1.7.127", "СтатусМинимум по ПУЭ 1.7.138: 4 мм² меди"], "boundary");
await calculate("sechenie-provodnika-uravnivaniya.html", { sys: "dop1", s1: "8,01", lay: "nz" }, ["Минимальное сечение4,005 мм² меди", "СтатусМинимум по ПУЭ 1.7.138: 4,005 мм² меди (по ряду — 6 мм²)"], "boundary");
// Алюминий в дополнительной системе: в кабеле 16/2 = 8 → по ряду 10; отдельно — 16 мм² (1.7.127).
await calculate("sechenie-provodnika-uravnivaniya.html", { sys: "dop1", s1: "16", mpe: "al", mb: "al", lay: "cab" }, ["СтатусМинимум по ПУЭ 1.7.138: 8 мм² алюминия (по ряду — 10 мм²)"]);
await calculate("sechenie-provodnika-uravnivaniya.html", { sys: "dop1", s1: "16", mpe: "al", mb: "al", lay: "nz" }, ["Минимум для проводника вне кабеля (ПУЭ 1.7.127)16 мм² алюминия", "СтатусМинимум по ПУЭ 1.7.138: 16 мм² алюминия"]);
await calculateWithout("sechenie-provodnika-uravnivaniya.html", { sys: "dop2", mb: "fe" }, ["для стали отдельно не задан", "СтатусНедостаточно данных"], ["Минимум по ПУЭ"]);
await calculate("sechenie-provodnika-uravnivaniya.html", { sys: "dop1", s1: "600", lay: "cab" }, ["Принять по стандартному рядусвыше 240 мм² — вне стандартного ряда", "СтатусМинимум по ПУЭ 1.7.138: 300 мм² меди, вне стандартного ряда"], "boundary");
await invalid("sechenie-provodnika-uravnivaniya.html", { smax: "abc" }, "Введите наибольшее сечение защитного проводника");
await invalid("sechenie-provodnika-uravnivaniya.html", { smax: "0" }, "Сечение должно быть больше нуля");
await invalid("sechenie-provodnika-uravnivaniya.html", { sys: "dop1", s1: "-2" }, "Сечение должно быть больше нуля");
await invalid("sechenie-provodnika-uravnivaniya.html", { sys: "dop2", s2: "" }, "Введите сечения PE обеих открытых проводящих частей");

// --- 19. dvoynoy-molnieotvod: СО 153-34.21.122-2003, п. 3.3.2.3, табл. 3.4 и 3.6 ---
// Эталон 1 (вручную): h = 20, 0,99: h0 = r0 = 16; Lmax = 95; Lc = 45; L = 60 → hc = 16·35/50 = 11,2;
// hx = 8 → rcx = 16·3,2/11,2 = 4,571; rx = 8.
await calculate("dvoynoy-molnieotvod.html", {}, ["Высота зоны у молниеотвода h₀ (табл. 3.4)16 м", "Радиус зоны у земли r₀ (табл. 3.4)16 м", "Предельное расстояние Lmax (табл. 3.6)95 м", "Расстояние без провеса зоны Lc (табл. 3.6)45 м", "Высота зоны посередине hc11,2 м", "rcx4,571 м (ширина 9,143 м)", "rx8 м", "СтатусОценка по СО 153: на высоте 8 м зона между молниеотводами не разорвана"]);
// Эталон 2 — проект АЗС ZandZ: L = 62,92, hx = 6,84 → hc = 10,27, rcx = 5,34 (у нас 5,339).
await calculate("dvoynoy-molnieotvod.html", { l: "62,92", hx: "6,84" }, ["Высота зоны посередине hc10,27 м", "rcx5,339 м", "rx9,16 м"]);
// Эталон 3 — учебный расчёт подстанции: h = 29,7 → Lc = 66,83, Lmax = 141,07 (при 4 знаках 141,1).
await calculate("dvoynoy-molnieotvod.html", { h: "29,7", l: "50", hx: "0" }, ["Предельное расстояние Lmax (табл. 3.6)141,1 м", "Расстояние без провеса зоны Lc (табл. 3.6)66,83 м", "L = 50 м ≤ Lc — граница зоны без провеса", "Высота зоны посередине hc23,76 м"]);
// Надёжность 0,9 (5,75h и 2,5h, h0 = 0,85h, r0 = 1,2h) и 0,999 (4,25h и 2,25h, h0 = 0,7h, r0 = 0,6h).
await calculate("dvoynoy-molnieotvod.html", { h: "10", nad: "0.9", l: "40", hx: "3" }, ["h₀ (табл. 3.4)8,5 м", "r₀ (табл. 3.4)12 м", "Lmax (табл. 3.6)57,5 м", "Lc (табл. 3.6)25 м", "Высота зоны посередине hc4,577 м", "rcx4,134 м"]);
await calculate("dvoynoy-molnieotvod.html", { h: "25", nad: "0.999", l: "60", hx: "5" }, ["h₀ (табл. 3.4)17,5 м", "Lmax (табл. 3.6)106,3 м", "Lc (табл. 3.6)56,25 м", "Высота зоны посередине hc16,19 м", "rcx10,37 м"]);
// Средние строки 30–100 м и верхние 100–150 м.
await calculate("dvoynoy-molnieotvod.html", { h: "50", l: "150", hx: "10" }, ["r₀ (табл. 3.4)38,57 м", "Lmax (табл. 3.6)233,9 м", "Lc (табл. 3.6)102,4 м", "Высота зоны посередине hc25,53 м", "rcx23,46 м"]);
await calculate("dvoynoy-molnieotvod.html", { h: "120", nad: "0.999", l: "200", hx: "20" }, ["h₀ (табл. 3.4)75,6 м", "r₀ (табл. 3.4)55,2 м", "Lmax (табл. 3.6)480 м", "Lc (табл. 3.6)180 м", "Высота зоны посередине hc70,56 м"]);
// h = 100 м — берётся более осторожная строка 100–150 м табл. 3.6: Lmax = 4,5h, Lc = 1,5h.
await calculate("dvoynoy-molnieotvod.html", { h: "100", l: "300", hx: "10" }, ["Lmax (табл. 3.6)450 м", "Lc (табл. 3.6)150 м", "Высота зоны посередине hc40 м"], "boundary");
await calculate("dvoynoy-molnieotvod.html", { h: "150", l: "300", hx: "10" }, ["h₀ (табл. 3.4)112,5 м", "Lmax (табл. 3.6)675 м", "Высота зоны посередине hc93,75 м"], "boundary");
// Остальные участки табл. 3.6 — строки таблицы видны в выдаче в учебных перепечатках
// (сверено 29.09.2026 по замечанию бота-ревьюера). Эталоны посчитаны отдельно по строкам
// таблицы, а не кодом страницы.
// 0,9, 30–100 м, h = 50: h₀ = 42,5; r₀ = 60; Lmax = (5,75 − 3,57·10⁻³·20)·50 = 283,9; Lc = 125;
// L = 150: hc = 42,5·(283,93 − 150)/(283,93 − 125) = 35,81; rcx = 60·(35,81 − 10)/35,81 = 43,25.
await calculate("dvoynoy-molnieotvod.html", { h: "50", nad: "0.9", l: "150", hx: "10" }, ["h₀ (табл. 3.4)42,5 м", "r₀ (табл. 3.4)60 м", "Lmax (табл. 3.6)283,9 м", "Lc (табл. 3.6)125 м", "Высота зоны посередине hc35,81 м", "rcx43,25 м", "rx45,88 м"]);
// 0,9, 100–150 м, h = 120: h₀ = 102; r₀ = 1,18·120 = 141,6; Lmax = 5,5·120 = 660; Lc = 2,5·120 = 300;
// L = 400: hc = 102·260/360 = 73,67; rcx = 141,6·(73,67 − 20)/73,67 = 103,2.
await calculate("dvoynoy-molnieotvod.html", { h: "120", nad: "0.9", l: "400", hx: "20" }, ["h₀ (табл. 3.4)102 м", "r₀ (табл. 3.4)141,6 м", "Lmax (табл. 3.6)660 м", "Lc (табл. 3.6)300 м", "Высота зоны посередине hc73,67 м", "rcx103,2 м", "rx113,8 м"]);
// 0,999, 30–100 м, h = 50: h₀ = 0,68572·50 = 34,29; r₀ = 0,5714·50 = 28,57;
// Lmax = (4,25 − 0,0714)·50 = 208,9; Lc = (2,25 − 0,2014)·50 = 102,4; L = 150: hc = 18,97; rcx = 13,51.
await calculate("dvoynoy-molnieotvod.html", { h: "50", nad: "0.999", l: "150", hx: "10" }, ["h₀ (табл. 3.4)34,29 м", "r₀ (табл. 3.4)28,57 м", "Lmax (табл. 3.6)208,9 м", "Lc (табл. 3.6)102,4 м", "Высота зоны посередине hc18,97 м", "rcx13,51 м", "rx20,24 м"]);
await invalid("dvoynoy-molnieotvod.html", { h: "150,01" }, "до 150 м");
// Граница Lc: при L = Lc провеса нет, при L чуть больше — есть.
await calculate("dvoynoy-molnieotvod.html", { l: "45" }, ["L = 45 м ≤ Lc — граница зоны без провеса", "Высота зоны посередине hc16 м", "rcx8 м"], "boundary");
await calculate("dvoynoy-molnieotvod.html", { l: "45,01" }, ["Lc < L = 45,01 м ≤ Lmax — граница зоны провисает", "rcx7,998 м"], "boundary");
// Граница Lmax: при L = Lmax зона посередине опускается до земли; за ней — два одиночных.
await calculateWithout("dvoynoy-molnieotvod.html", { l: "95", hx: "0" }, ["Высота зоны посередине hc0 м", "нет — hx ≥ hc", "СтатусОценка по СО 153: на высоте 0 м посередине между молниеотводами зоны нет (hx ≥ hc)"], ["не разорвана"], "boundary");
await calculateWithout("dvoynoy-molnieotvod.html", { l: "95,01", hx: "0" }, ["L = 95,01 м > Lmax — общей зоны нет", "Радиус зоны каждого молниеотвода на высоте 0 м16 м", "СтатусОценка по СО 153: L > Lmax — общей зоны нет, молниеотводы считаются одиночными"], ["hc", "не разорвана"], "boundary");
// Граница hx = hc: объект высотой hc посередине не защищён; на 1 см ниже — зона есть.
await calculateWithout("dvoynoy-molnieotvod.html", { hx: "11,2" }, ["нет — hx ≥ hc", "rx4,8 м", "зоны нет (hx ≥ hc)"], ["не разорвана"], "boundary");
await calculate("dvoynoy-molnieotvod.html", { hx: "11,19" }, ["rcx0,01429 м", "rx4,81 м", "зона между молниеотводами не разорвана"], "boundary");
await calculate("dvoynoy-molnieotvod.html", { hx: "16" }, ["rcxнет — hx ≥ hc", "rxнет — hx ≥ h₀", "зоны нет (hx ≥ hc)"], "boundary");
await invalid("dvoynoy-molnieotvod.html", { h: "abc" }, "Заполните высоту молниеотводов");
await invalid("dvoynoy-molnieotvod.html", { h: "0" }, "Высота молниеотвода должна быть больше нуля");
await invalid("dvoynoy-molnieotvod.html", { l: "-5" }, "Расстояние между молниеотводами должно быть больше нуля");
await invalid("dvoynoy-molnieotvod.html", { hx: "-1" }, "Высота объекта не может быть отрицательной");

// --- 21. vybor-uzip: IEC 60364-5-53, раздел 534 (по вторичным источникам) ---
// Эталон 1 (вручную): TN-C-S, 220 В, без молниезащиты, кабель: класс II, Uc ≥ 1,1·220 = 242, N–PE ≥ 220, Up ≤ 2,5 − 0,5 = 2 кВ.
await calculate("vybor-uzip.html", {}, ["Класс испытаний УЗИП на вводеII (тип 2)", "Импульсный ток Iimp (10/350) на вид защитыне требуется для класса II", "Номинальный разрядный ток In (8/20) на вид защитыне менее 5 кА", "Uc, фаза – PE и фаза – Nне менее 1,1·U₀ = 242 В", "Uc, N – PEне менее U₀ = 220 В", "не выше 2,5 кВ — стойкость оборудования категории II", "Up с учётом проводников: 0,5 м × ≈1 кВ/мне выше 2 кВ", "СтатусОценка минимальных требований: класс II, In ≥ 5 кА, Uc ≥ 242 В, Up ≤ 2 кВ"]);
// Рискованный вердикт: при молниезащите без расчёта Iimp — «Недостаточно данных», 12,5 кА сам не подставляется.
await calculateWithout("vybor-uzip.html", { lps: "yes" }, ["Класс испытаний УЗИП на вводеI (тип 1)", "недостаточно данных: по расчёту IEC 62305; 12,5 кА — только если ток установить нельзя", "СтатусНедостаточно данных: Iimp устанавливают расчётом по IEC 62305"], ["Оценка минимальных требований", "не менее 12,5 кА"]);
await calculate("vybor-uzip.html", { lps: "yes", iimp: "25" }, ["не менее 25 кА — по расчёту IEC 62305", "СтатусОценка минимальных требований: класс I, Iimp ≥ 25 кА, In ≥ 5 кА, Uc ≥ 242 В, Up ≤ 2 кВ"]);
// Эталон 2 (BS 7671, «4 times 12.5 kA»): TT, три фазы, Iimp 12,5 → разрядник N–PE 50 кА; In N–PE 20 кА.
await calculate("vybor-uzip.html", { sys: "tt", lps: "yes", iimp: "12,5" }, ["Iimp разрядника N–PE в схеме «3+1»не менее 50 кА — сумма токов четырёх проводников", "In разрядника N–PE в схеме «3+1»не менее 20 кА", "Uc, фаза – Nне менее 1,1·U₀ = 242 В", "Uc, N – PEне менее U₀ = 220 В"]);
await calculate("vybor-uzip.html", { sys: "tt", faz: "1", lps: "yes", iimp: "12,5" }, ["не менее 25 кА — сумма токов двух проводников", "In разрядника N–PE в схеме «3+1»не менее 10 кА"]);
await calculateWithout("vybor-uzip.html", { sys: "tt" }, ["In разрядника N–PE в схеме «3+1»не менее 20 кА"], ["Iimp разрядника"]);
// IT: по Schneider (рис. J23) фаза – PE 1,1·U = 1,1·√3·230 = 438,2 В; N – PE 1,1·U₀ = 253 В.
// IT: значение Uc между фазой и PE и между N и PE источники дают по-разному (U или 1,1·U;
// U₀ или 1,1·U₀), текст табл. 534.2 в выдаче не виден — калькулятор значение не выбирает
// (замечание P1 бота-ревьюера). √3·230 = 398,4 В; 1,1·√3·230 = 438,2 В.
await calculateWithout("vybor-uzip.html", { sys: "itn", u0: "230" }, ["Uc, фаза – Nне менее 1,1·U₀ = 253 В", "Uc, фаза – PEнедостаточно данных: источники расходятся — U = √3·U₀ = 398,4 В или 1,1·U = 438,2 В", "Uc, N – PEнедостаточно данных: источники расходятся — U₀ = 230 В или 1,1·U₀ = 253 В", "СтатусНедостаточно данных: Uc для системы IT между фазой и PE — источники расходятся (U или 1,1·U)"], ["Оценка минимальных требований", "не менее 1,1·U ="]);
await calculateWithout("vybor-uzip.html", { sys: "it" }, ["Uc, фаза – PEнедостаточно данных: источники расходятся — U = √3·U₀ = 381,1 В или 1,1·U = 419,2 В", "СтатусНедостаточно данных: Uc для системы IT"], ["Оценка минимальных требований"]);
// Несколько причин «Недостаточно данных» перечисляются вместе: воздушный ввод без молниезащиты и IT.
await calculate("vybor-uzip.html", { sys: "it", vvod: "vl" }, ["СтатусНедостаточно данных: класс УЗИП для воздушного ввода определяет оценка риска по IEC 62305-2; Uc для системы IT между фазой и PE — источники расходятся"]);
await calculate("vybor-uzip.html", { sys: "tnc" }, ["Uc, фаза – PENне менее 1,1·U₀ = 242 В"]);
// Воздушный ввод без молниезащиты: класс не выбирается.
await calculateWithout("vybor-uzip.html", { vvod: "vl" }, ["не определён: при воздушном вводе без молниезащиты нужна оценка риска", "СтатусНедостаточно данных: класс УЗИП для воздушного ввода определяет оценка риска по IEC 62305-2"], ["II (тип 2)", "Оценка минимальных требований"]);
// Границы: проводники 0,5 м и 0,51 м; 2,5 м — уровень недостижим, 2,49 м — ещё 0,01 кВ.
await calculate("vybor-uzip.html", { lp: "0,5" }, ["0,5 м — не больше рекомендуемых 0,5 м", "Up ≤ 2 кВ"], "boundary");
await calculate("vybor-uzip.html", { lp: "0,51" }, ["0,51 м — больше рекомендуемых 0,5 м", "не выше 1,99 кВ", "Up ≤ 1,99 кВ; проводники длиннее рекомендуемых 0,5 м"], "boundary");
await calculateWithout("vybor-uzip.html", { lp: "2,5" }, ["недостижим: проводники слишком длинные", "СтатусОценка: при проводниках 2,5 м уровень защиты 2,5 кВ недостижим"], ["Оценка минимальных требований"], "boundary");
await calculate("vybor-uzip.html", { lp: "2,49" }, ["не выше 0,01 кВ"], "boundary");
// Граница 10 м до оборудования.
await calculateWithout("vybor-uzip.html", { dist: "10" }, ["10 м — в пределах 10 м"], ["дополнительный УЗИП"], "boundary");
await calculate("vybor-uzip.html", { dist: "10,01" }, ["10,01 м — больше 10 м: нужен дополнительный УЗИП у оборудования", "; у оборудования нужен дополнительный УЗИП", "до удвоенного Up"], "boundary");
// Границы U₀: 200…250 В включительно.
await calculate("vybor-uzip.html", { u0: "250" }, ["1,1·U₀ = 275 В"], "boundary");
await calculate("vybor-uzip.html", { u0: "200" }, ["1,1·U₀ = 220 В"], "boundary");
await invalid("vybor-uzip.html", { u0: "250,01" }, "U₀ от 200 до 250 В");
await invalid("vybor-uzip.html", { u0: "199,99" }, "U₀ от 200 до 250 В");
await invalid("vybor-uzip.html", { u0: "abc" }, "Введите номинальное фазное напряжение");
await invalid("vybor-uzip.html", { lps: "yes", iimp: "abc" }, "Iimp по расчёту должен быть числом или пустым полем");
await invalid("vybor-uzip.html", { lps: "yes", iimp: "0" }, "Iimp должен быть больше нуля");
await invalid("vybor-uzip.html", { lp: "0" }, "Длины должны быть больше нуля");
await invalid("vybor-uzip.html", { dist: "-1" }, "Длины должны быть больше нуля");

// --- 23. obryv-pen: метод двух узлов (теорема Миллмана) ---
// Эталон 1 (вручную): две одинаковые фазы, полный обрыв — последовательно на U_л = √3·220 = 381,1 В,
// по 190,5 В на каждой; смещение |(Ua + Ub)/2| = U₀/2 = 110 В; фаза C без нагрузки видит 1,5·U₀ = 330 В.
await calculate("obryv-pen.html", { pa: "2", pb: "2", pc: "" }, ["Смещение нейтрали нагрузки U_N′110 В (50 % U₀)", "Фаза A: напряжение на нагрузке190,5 В (86,6 % U₀)", "Фаза B: напряжение на нагрузке190,5 В", "Фаза C: нагрузки нет, фаза – нейтраль нагрузки330 В (150 % U₀)", "Отклонение от U₀ на нагруженных фазах (справочно)−13,4 %", "Потенциал корпусов (PE после обрыва) относительно нейтрали источника110 В", "СтатусОценка аварийного режима: корпуса под потенциалом 110 В, на нагруженных фазах 190,5 В"]);
// Эталон 2: симметричная нагрузка — смещения нет, но статус не называет режим безопасным.
await calculateWithout("obryv-pen.html", { pa: "2", pb: "2", pc: "2" }, ["Смещение нейтрали нагрузки U_N′0 В (0 % U₀)", "Фаза A: напряжение на нагрузке220 В (100 % U₀)", "Отклонение от U₀ на нагруженных фазах (справочно)0 %", "СтатусОценка аварийного режима: смещения нет только при строго симметричной нагрузке", "безопасным это не делает"], ["Безопасно", "безопасен", "Соответствует"]);
// Эталон 3: нагружена одна фаза, полный обрыв — тока нет, нейтраль и корпуса под фазным потенциалом 220 В.
await calculate("obryv-pen.html", { pa: "2", pb: "", pc: "" }, ["Смещение нейтрали нагрузки U_N′220 В (100 % U₀)", "Фаза A: напряжение на нагрузке0 В (0 % U₀)", "Фаза B: нагрузки нет, фаза – нейтраль нагрузки381,1 В (173,2 % U₀)", "Отклонение от U₀ на нагруженной фазе (справочно)−100 %", "СтатусОценка аварийного режима: корпуса под потенциалом 220 В", "на нагруженной фазе 0 В"]);
// Нагрузка по умолчанию 3/1/0,5 кВт (скрипт ref_values.py): смещение 112 В, фазы 112 / 277,6 / 305,3 В.
await calculate("obryv-pen.html", {}, ["Смещение нейтрали нагрузки U_N′112 В (50,92 % U₀)", "Фаза B: напряжение на нагрузке277,6 В (126,2 % U₀)", "Фаза C: напряжение на нагрузке305,3 В (138,8 % U₀)", "от −49,08 % до +38,78 %", "СтатусОценка аварийного режима: корпуса под потенциалом 112 В, на нагруженных фазах от 112 до 305,3 В"]);
// Режим «через повторное заземление» Rп = 30, R₀ = 4: смещение 85,1 В, корпуса относительно земли 85,1·30/34 = 75,09 В.
await calculate("obryv-pen.html", { put: "rz" }, ["Смещение нейтрали нагрузки U_N′85,1 В", "Фаза A: напряжение на нагрузке137,4 В", "Фаза B: напряжение на нагрузке260,6 В", "Фаза C: напряжение на нагрузке283,1 В", "Потенциал корпусов относительно удалённой земли75,09 В", "Ток через повторное заземление2,503 А", "больше 50 В: ПУЭ 1.7.53"]);
await calculate("obryv-pen.html", { pa: "3", pb: "", pc: "", put: "rz" }, ["Смещение нейтрали нагрузки U_N′149,2 В", "Фаза A: напряжение на нагрузке70,8 В", "Потенциал корпусов относительно удалённой земли131,6 В", "Ток через повторное заземление4,388 А"]);
// Однофазный абонент без повторного заземления: тока нет, корпуса под фазным потенциалом.
await calculate("obryv-pen.html", { set: "1" }, ["Ток нагрузки0 А — пути для тока нет", "Напряжение на нагрузке0 В (0 % U₀)", "Потенциал N и PE абонента (корпусов) относительно нейтрали источника220 В (100 % U₀)", "СтатусОценка аварийного режима: корпуса под потенциалом 220 В, нагрузка получает 0 В", "Однофазный абонент: ток нагрузки может вернуться к источнику только через землю"]);
// Эталон IET (Wiring Matters, «Broken PEN»): 230 В, 7 кВт, заземлитель 2,1 Ом → 230·2,1/(230²/7000 + 2,1) = 50,01 В.
await calculate("obryv-pen.html", { set: "1", u0: "230", p1: "7", put: "rz", rp: "2,1", r0: "0" }, ["Ток нагрузки23,82 А", "Напряжение на нагрузке180 В", "Потенциал корпусов относительно удалённой земли50,01 В"]);
// Граница 50 В (ПУЭ 1.7.53: «превышает 50 В») проверяется по верхней оценке напряжения прикосновения —
// полному смещению U_N′ относительно нейтрали источника. 100 В, 1,25 кВт → R = 8 Ом; Rп + R₀ = 8 Ом:
// ток 100/16 = 6,25 А, U_N′ = 6,25 · 8 = 50 В точно и в двоичной арифметике.
await calculateWithout("obryv-pen.html", { set: "1", u0: "100", p1: "1,25", put: "rz", rp: "4", r0: "4" }, ["Ток нагрузки6,25 А", "Напряжение на нагрузке50 В", "Потенциал N и PE абонента (корпусов) относительно нейтрали источника50 В (50 % U₀)", "Потенциал корпусов относительно удалённой земли25 В", "не выше 50 В даже относительно нейтрали источника, но безопасным это не делает"], ["больше 50 В"], "boundary");
await calculate("obryv-pen.html", { set: "1", u0: "100", p1: "1,251", put: "rz", rp: "4", r0: "4" }, ["Потенциал N и PE абонента (корпусов) относительно нейтрали источника50,02 В", "Потенциал корпусов относительно удалённой земли25,01 В", "напряжение может достигать 50,02 В (относительно удалённой земли — 25,01 В), больше 50 В: ПУЭ 1.7.53"], "boundary");
// Единицы: 2000 Вт — то же, что 2 кВт.
await calculate("obryv-pen.html", { pa: "2000", pa_unit: "1", pb: "2", pc: "2" }, ["Смещение нейтрали нагрузки U_N′0 В"]);
// Сети до 1 кВ: в трёхфазном режиме линейное √3·U₀ ≤ 1000 В, то есть U₀ ≤ 577,35 В;
// смещение пропорционально U₀: 0,5092 · 577 = 293,8 В. У однофазного абонента — до 1000 В.
await calculate("obryv-pen.html", { u0: "577" }, ["Смещение нейтрали нагрузки U_N′293,8 В (50,92 % U₀)", "Фаза C: напряжение на нагрузке800,7 В"], "boundary");
await invalid("obryv-pen.html", { u0: "577,36" }, "U₀ не больше 577 В");
await calculate("obryv-pen.html", { set: "1", u0: "1000" }, ["Потенциал N и PE абонента (корпусов) относительно нейтрали источника1000 В (100 % U₀)"], "boundary");
await invalid("obryv-pen.html", { set: "1", u0: "1000,01" }, "U₀ не больше 1000 В");
await invalid("obryv-pen.html", { pa: "", pb: "", pc: "" }, "Введите мощность нагрузки хотя бы одной фазы");
await invalid("obryv-pen.html", { pa: "abc" }, "Фаза A: введите число или оставьте поле пустым");
await invalid("obryv-pen.html", { pb: "-1" }, "Фаза B: мощность не может быть отрицательной");
await invalid("obryv-pen.html", { u0: "0" }, "Напряжение должно быть больше нуля");
await invalid("obryv-pen.html", { put: "rz", rp: "0" }, "Сопротивление повторного заземления должно быть больше нуля");
await invalid("obryv-pen.html", { put: "rz", r0: "-1" }, "не может быть отрицательным");
await invalid("obryv-pen.html", { put: "rz", rp: "abc" }, "Введите сопротивление повторного заземления");
await invalid("obryv-pen.html", { set: "1", p1: "" }, "Введите мощность нагрузки абонента");

// Видимость полей: скрытый режим не должен оставлять лишних полей, а
// каждый переключатель — показывать то, от чего зависит расчёт (правило 7).
{
  kind = "structural";
  const vis = (document, id) => document.getElementById(`f_${id}`).style.display !== "none";
  const change = (dom, id, value) => {
    const el = dom.window.document.getElementById(id);
    el.value = value; el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  };
  let dom = await load("sechenie-provodnika-uravnivaniya.html");
  let d = dom.window.document;
  check(vis(d, "smax") && !vis(d, "s1") && !vis(d, "s2") && !vis(d, "lay"), "sechenie-provodnika-uravnivaniya: в основной системе видно только наибольшее сечение PE");
  change(dom, "sys", "dop2");
  check(!vis(d, "smax") && vis(d, "s1") && vis(d, "s2") && vis(d, "lay"), "sechenie-provodnika-uravnivaniya: для двух открытых частей нужны оба PE и способ прокладки");
  change(dom, "sys", "dop1");
  check(vis(d, "s1") && !vis(d, "s2") && vis(d, "lay"), "sechenie-provodnika-uravnivaniya: для открытой и сторонней части — один PE");
  dom.window.close();
  dom = await load("vybor-uzip.html"); d = dom.window.document;
  check(!vis(d, "iimp") && vis(d, "vvod") && !vis(d, "faz"), "vybor-uzip: без молниезащиты поле Iimp скрыто, ввод виден, число фаз скрыто вне TT");
  change(dom, "lps", "yes");
  check(vis(d, "iimp") && !vis(d, "vvod"), "vybor-uzip: при молниезащите видно Iimp, ввод не влияет на класс и скрыт");
  change(dom, "sys", "tt");
  check(vis(d, "faz"), "vybor-uzip: для TT число фаз влияет на разрядник N–PE и должно быть видно");
  dom.window.close();
  dom = await load("obryv-pen.html"); d = dom.window.document;
  check(vis(d, "pa") && vis(d, "pb") && vis(d, "pc") && !vis(d, "p1") && !vis(d, "rp") && !vis(d, "r0"), "obryv-pen: в трёхфазном режиме без пути через землю видны только три нагрузки");
  change(dom, "set", "1"); change(dom, "put", "rz");
  check(!vis(d, "pa") && vis(d, "p1") && vis(d, "rp") && vis(d, "r0"), "obryv-pen: у однофазного абонента одна нагрузка, при повторном заземлении видны Rп и R₀");
  dom.window.close();
}

// Семантика: то, что источник не подтверждает, не выдаётся за норму.
{
  kind = "structural";
  const text = file => fs.readFileSync(path.join(sourceDir, file), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const bond = text("sechenie-provodnika-uravnivaniya.html");
  check(/Применение проводников большего сечения, как правило, не требуется/.test(bond),
    "sechenie-provodnika-uravnivaniya: потеряно «как правило» из ПУЭ 1.7.137");
  check(/однозначно установить не удалось/.test(bond),
    "sechenie-provodnika-uravnivaniya: правило половины наибольшего PE приписано ГОСТ Р 50571.5.54 без оговорки");
  check(/эквивалентности по проводимости/.test(bond) && /Недостаточно данных/.test(bond),
    "sechenie-provodnika-uravnivaniya: нет основания пересчёта металлов или оговорки «Недостаточно данных»");
  const rod = text("dvoynoy-molnieotvod.html");
  check(/3\.3\.2\.3/.test(rod) && /табл\. 3\.6/.test(rod) && !/3\.3\.2\.2/.test(rod) && !/табл(ица|\.) 3\.5/.test(rod),
    "dvoynoy-molnieotvod: номер пункта и таблицы двойного стержневого молниеотвода — 3.3.2.3 и 3.6, а не 3.3.2.2 и 3.5");
  check(/РД 34\.21\.122-87/.test(rod) && /в СО 153 его нет/.test(rod),
    "dvoynoy-molnieotvod: правило попарной проверки rcx > 0 приписано СО 153 — оно из РД 34.21.122-87");
  check(/категорию объекта не определяет/.test(rod),
    "dvoynoy-molnieotvod: не сказано, что калькулятор не определяет категорию объекта");
  const spd = text("vybor-uzip.html");
  check(/дословно не виден/.test(spd) && !/подходит/.test(spd),
    "vybor-uzip: требования раздела 534 выданы за дословно сверенные или страница обещает, что УЗИП «подходит»");
  const pen = text("obryv-pen.html");
  check(/100 % времени интервала в одну неделю/.test(pen) && /справочно/.test(pen),
    "obryv-pen: формулировка ГОСТ 32144-2013 неточна или отклонения выданы за нормативный вердикт");
  check(/питающиеся|однофазных ответвлений от ВЛ/.test(pen),
    "obryv-pen: исключение ПУЭ 1.7.145 процитировано без условия об однофазных ответвлениях от ВЛ");
}

// Предел рядом с вердиктом не должен округляться на другую сторону порога:
// при RA = 1667 Ом и 30 мА точный предел 50/0,03 = 1666,67 Ом, а «1667 Ом»
// рядом со статусом «не выполняется» противоречило бы ему (находка
// независимого проверяющего). Ожидаемые строки посчитаны отдельно.
await calculate("zazemlenie-tt-uzo.html", { ra: "1667", rasrc: "worst" }, ["Наибольшее допустимое RA = 50 В / IΔn1666,7 Ом", "Наибольший допустимый IΔn при этом RA = 50 В / RA29,99 мА", "СтатусУсловие RA·IΔn ≤ 50 В не выполняется"], "boundary");
await calculate("zazemlenie-tt-uzo.html", { idn: "0.3", ra: "166,67", rasrc: "worst" }, ["Наибольшее допустимое RA = 50 В / IΔn166,667 Ом", "Наибольший допустимый IΔn при этом RA = 50 В / RA299,99 мА", "СтатусУсловие RA·IΔn ≤ 50 В не выполняется"], "boundary");
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "30", ra: "1667", rasrc: "worst" }, ["RA = 50 В / Id1666,7 Ом", "СтатусУсловие RA·Id ≤ 50 В не выполняется"], "boundary");
// Порог 50 В на обрыве PEN: 200 В, 2,50001 кВт, Rп = R₀ = 8 Ом → 50,0001 В, а не «50 В … больше 50 В».
await calculate("obryv-pen.html", { set: "1", u0: "100", p1: "1,25001", put: "rz", rp: "4", r0: "4" }, ["Потенциал N и PE абонента (корпусов) относительно нейтрали источника50,0002 В", "может достигать 50,0002 В (относительно удалённой земли — 25 В), больше 50 В"], "boundary");

// Находки независимого проверяющего партии №2 (ожидаемые строки посчитаны отдельно).
// IT, ПУЭ 1.7.104: сопротивление больше 4 Ом допускается только до 10 Ом и только при мощности
// источника до 100 кВ·А — иначе вывода «выполняется» нет, даже если RA·Id ≤ 50 В.
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "4", rasrc: "worst" }, ["RA·Id0,8 В", "ПУЭ 1.7.104: 4 и 10 ОмRA не больше 4 Ом", "СтатусУсловие RA·Id ≤ 50 В выполняется"], "boundary");
await calculateWithout("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "4,01", rasrc: "worst" }, ["СтатусНедостаточно данных: RA больше 4 Ом, а мощность источника и сопротивление заземляющего устройства без защитного проводника не заданы (ПУЭ 1.7.104)"], ["Условие RA·Id ≤ 50 В выполняется"], "boundary");
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "8", rasrc: "worst", pist: "le100" }, ["ПУЭ 1.7.104: 4 и 10 ОмRA больше 4 Ом, но не больше 10 Ом — допускается", "СтатусУсловие RA·Id ≤ 50 В выполняется", "этот допуск выполнен"]);
await calculateWithout("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "8", rasrc: "worst", pist: "gt100" }, ["СтатусНедостаточно данных: RA больше 4 Ом при мощности источника больше 100 кВ·А, а сопротивление заземляющего устройства без защитного проводника не задано (ПУЭ 1.7.104)", "допуск до 10 Ом к такому источнику не относится"], ["Условие RA·Id ≤ 50 В выполняется"]);
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "10", rasrc: "worst", pist: "le100" }, ["СтатусУсловие RA·Id ≤ 50 В выполняется"], "boundary");
await calculateWithout("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "10,01", rasrc: "worst", pist: "le100" }, ["СтатусНедостаточно данных: RA больше 10 Ом, а сопротивление заземляющего устройства без защитного проводника не задано (ПУЭ 1.7.104)", "больше 10 Ом: такого значения пункт прямо не допускает"], ["Условие RA·Id ≤ 50 В выполняется"], "boundary");
await calculateWithout("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "20", rasrc: "worst", pist: "le100" }, ["RA·Id4 В", "СтатусНедостаточно данных: RA больше 10 Ом, а сопротивление заземляющего устройства без защитного проводника не задано (ПУЭ 1.7.104)"], ["Условие RA·Id ≤ 50 В выполняется"]);
// Замечание бота-ревьюера к PR #22: оговорки ПУЭ 1.7.104 про 4 и 10 Ом относятся к сопротивлению
// заземляющего устройства, а RA включает ещё и защитный проводник. Пример бота: заземлитель 4 Ом,
// защитный проводник 0,1 Ом, RA = 4,1 Ом, источник больше 100 кВ·А; RA·Id = 4,1 · 0,2 = 0,82 В.
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "4,1", rz: "4", rasrc: "worst", pist: "gt100" }, ["RA·Id0,82 В", "ПУЭ 1.7.104: 4 и 10 ОмСопротивление заземляющего устройства не больше 4 Ом — оговорки не ограничивают", "СтатусУсловие RA·Id ≤ 50 В выполняется"], "boundary");
await calculateWithout("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "4,1", rasrc: "worst", pist: "gt100" }, ["СтатусНедостаточно данных: RA больше 4 Ом при мощности источника больше 100 кВ·А, а сопротивление заземляющего устройства без защитного проводника не задано (ПУЭ 1.7.104)", "Здесь с 4 и 10 Ом сравнивается RA — это в запас"], ["Условие RA·Id ≤ 50 В выполняется"]);
await calculateWithout("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "4,1", rz: "4,01", rasrc: "worst", pist: "gt100" }, ["СтатусНедостаточно данных: сопротивление заземляющего устройства больше 4 Ом при мощности источника больше 100 кВ·А (ПУЭ 1.7.104)"], ["Условие RA·Id ≤ 50 В выполняется", "сравнивается RA"], "boundary");
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "4", rz: "4", rasrc: "worst", pist: "gt100" }, ["СтатусУсловие RA·Id ≤ 50 В выполняется"], "boundary");
// Мощность источника не задана: заземляющее устройство до 4 Ом снимает вопрос о мощности.
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "8", rz: "3,9", rasrc: "worst" }, ["Сопротивление заземляющего устройства не больше 4 Ом", "СтатусУсловие RA·Id ≤ 50 В выполняется"]);
await calculateWithout("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "8", rz: "5", rasrc: "worst" }, ["СтатусНедостаточно данных: сопротивление заземляющего устройства больше 4 Ом, а мощность источника не задана (ПУЭ 1.7.104)"], ["Условие RA·Id ≤ 50 В выполняется"]);
// Источник до 100 кВ·А: предел 10 Ом — по заземляющему устройству, RA может быть больше.
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "10,5", rz: "10", rasrc: "worst", pist: "le100" }, ["RA·Id2,1 В", "Сопротивление заземляющего устройства больше 4 Ом, но не больше 10 Ом — допускается", "СтатусУсловие RA·Id ≤ 50 В выполняется"], "boundary");
await calculateWithout("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "200", ra: "10,5", rz: "10,01", rasrc: "worst", pist: "le100" }, ["СтатусНедостаточно данных: сопротивление заземляющего устройства больше 10 Ом (ПУЭ 1.7.104)"], ["Условие RA·Id ≤ 50 В выполняется"], "boundary");
// Условие RA·Id ≤ 50 В по-прежнему проверяется по полному RA, а не по сопротивлению заземляющего устройства.
await calculate("zamykanie-na-zemlyu-it.html", { idmode: "design", id: "1", id_unit: "1", ra: "60", rz: "3", rasrc: "worst", pist: "gt100" }, ["RA·Id60 В", "СтатусУсловие RA·Id ≤ 50 В не выполняется"]);
await invalid("zamykanie-na-zemlyu-it.html", { ra: "4", rz: "4,01" }, "Сопротивление заземляющего устройства больше RA");
await invalid("zamykanie-na-zemlyu-it.html", { rz: "0" }, "Сопротивление заземляющего устройства должно быть положительным числом");
await invalid("zamykanie-na-zemlyu-it.html", { rz: "-1" }, "Сопротивление заземляющего устройства должно быть положительным числом");
await invalid("zamykanie-na-zemlyu-it.html", { rz: "4 Ом" }, "Сопротивление заземляющего устройства должно быть положительным числом");
// Обрыв PEN: верхняя оценка напряжения прикосновения — полное смещение U_N′ (между корпусом и
// металлом, связанным с исправным PEN), а не потенциал относительно удалённой земли.
// 230 В, 2 кВт, Rп = R₀ = 10 Ом: R = 26,45 Ом, ток 230/46,45 = 4,952 А, U_N′ = 99,03 В, земля 49,52 В.
await calculateWithout("obryv-pen.html", { set: "1", u0: "230", p1: "2", put: "rz", rp: "10", r0: "10" }, ["Потенциал N и PE абонента (корпусов) относительно нейтрали источника99,03 В (43,06 % U₀)", "Потенциал корпусов относительно удалённой земли49,52 В", "может достигать 99,03 В (относительно удалённой земли — 49,52 В), больше 50 В"], ["не выше 50 В"]);
// Двойной молниеотвод: сближение стержней не спасает широкое здание — при L ≤ Lc на высоте 12 м
// полуширина rcx = 16·(16 − 12)/16 = 4 м. Отображение у границы Lmax = 4,75·29,7 = 141,075 м.
await calculate("dvoynoy-molnieotvod.html", { l: "45", hx: "12" }, ["rcx4 м (ширина 8 м)"]);
await calculate("dvoynoy-molnieotvod.html", { h: "29,7", l: "141,1", hx: "0" }, ["L = 141,1 м > Lmax", "Lmax (табл. 3.6)141,07 м"], "boundary");
// УЗИП и уравнивание: число у порога показывается по ту же сторону порога, что и точное.
await calculate("vybor-uzip.html", { lp: "0,50001" }, ["0,50001 м — больше рекомендуемых 0,5 м"], "boundary");
await calculate("vybor-uzip.html", { dist: "10,0001" }, ["10,0001 м — больше 10 м: нужен дополнительный УЗИП у оборудования либо УЗИП с Up не выше половины стойкости оборудования"], "boundary");
await calculate("sechenie-provodnika-uravnivaniya.html", { smax: "50,00002", mpe: "al", mb: "al" }, ["Половина наибольшего PE (ПУЭ 1.7.137)25,00001 мм² алюминия", "СтатусНедостаточно данных"], "boundary");
{
  kind = "structural";
  const text = file => fs.readFileSync(path.join(sourceDir, file), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const rod = text("dvoynoy-molnieotvod.html");
  check(!/L ≤ 57,5/.test(rod) && /поместится только объект шириной до 8 м/.test(rod),
    "dvoynoy-molnieotvod: пример снова предлагает сблизить стержни, хотя зона на высоте здания остаётся узкой");
  const pen = text("obryv-pen.html");
  check(!/удалённой земли — (его )?верхняя оценка/.test(pen) && /верхняя оценка — U/.test(pen),
    "obryv-pen: верхней оценкой напряжения прикосновения должно быть полное смещение U_N′, а не потенциал относительно удалённой земли");
  const single = text("molniezashchita.html");
  check(/в сто раз строже/.test(single) && !/в тысячу раз/.test(single),
    "molniezashchita: 0,999 против 0,9 — это допуск в 100 раз строже (0,1 % против 10 %), а не в 1000");
}

// TT, особые установки (замечание P1 бота-ревьюера): для временных, сельскохозяйственных и
// садоводческих установок предел 25 В (Schneider Electric), вид установки выбирает пользователь.
// 300 мА, RA 100 Ом: 30 В > 25 В — не выполняется, хотя по 50 В выполнялось бы; RA,max = 25/0,3 = 83,33 Ом.
await calculateWithout("zazemlenie-tt-uzo.html", { ul: "25", idn: "0.3", ra: "100", rasrc: "worst" }, ["RA·IΔn30 В", "Наибольшее допустимое RA = 25 В / IΔn83,33 Ом", "Наибольший допустимый IΔn при этом RA = 25 В / RA250 мА", "СтатусУсловие RA·IΔn ≤ 25 В не выполняется", "Предел 25 В для временных"], ["Условие RA·IΔn ≤ 25 В выполняется", "≤ 50 В"]);
await calculate("zazemlenie-tt-uzo.html", { idn: "0.3", ra: "100", rasrc: "worst" }, ["СтатусУсловие RA·IΔn ≤ 50 В выполняется", "выберите её вид"]);
await calculate("zazemlenie-tt-uzo.html", { ul: "25", idn: "0.1", ra: "250", rasrc: "worst" }, ["RA·IΔn25 В", "СтатусУсловие RA·IΔn ≤ 25 В выполняется"], "boundary");
await calculate("zazemlenie-tt-uzo.html", { ul: "25", idn: "0.1", ra: "250,01", rasrc: "worst" }, ["RA·IΔn25,001 В", "Наибольший допустимый IΔn при этом RA = 25 В / RA99,996 мА", "СтатусУсловие RA·IΔn ≤ 25 В не выполняется"], "boundary");
{
  kind = "structural";
  const dom = await load("zazemlenie-tt-uzo.html");
  const d = dom.window.document;
  check(d.getElementById("f_ul").style.display !== "none", "zazemlenie-tt-uzo: при УЗО должен быть виден выбор вида электроустановки");
  const dev = d.getElementById("dev"); dev.value = "ocpd"; dev.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  check(d.getElementById("f_ul").style.display === "none", "zazemlenie-tt-uzo: в режиме автомата вид установки не влияет на расчёт и должен быть скрыт");
  dom.window.close();
}

// Сверка при интеграции партии №2. Надёжность молниезащиты по СО 153 —
// это не категория объекта: по таблице 2.1 обычным объектам соответствуют
// уровни I–IV с надёжностью 0,98/0,95/0,90/0,80, и подпись «0,9 — обычные
// объекты» толкала к недостаточной защите для уровней I и II.
{
  kind = "structural";
  const text = file => fs.readFileSync(path.join(sourceDir, file), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const file of ["molniezashchita.html", "dvoynoy-molnieotvod.html"]) {
    const t = text(file);
    check(!/0,9\s*—\s*обычн/.test(t) && !/особо ответственн/.test(t),
      `${file}: надёжность 0,9/0,99/0,999 подписана как категория объекта`);
    check(/0,98, 0,95, 0,90 и 0,80/.test(t) && /таблиц[еы] 2\.1/.test(t),
      `${file}: не приведены уровни защиты обычных объектов по таблице 2.1 СО 153`);
  }
  // «Проходит» — запрещённая форма статуса (правило 6). Она вернулась бы
  // незаметно через текст примера, поэтому проверяем видимый текст всех
  // страниц, а не только строку статуса расчёта.
  for (const file of htmlFiles) {
    const hit = text(file).match(/Статус\s*[—:-]\s*(не\s+)?проходит/i);
    check(!hit, `${file}: в тексте статус «${hit?.[0]}» — запрещённая форма`);
  }
}

// ===========================================================================
// --- Партия №3, data_m.py ---
// Электродвигатели и приводы: подбор ПЧ по току, тормозной резистор ЧРП,
// КПД по классам IE2–IE4, приведённый момент инерции, клиноремённая
// передача. Ожидаемые значения посчитаны отдельным скриптом (scratchpad
// m/ref.py, m/ref2.py) с округлением как у toPrecision (половина — вверх), а
// не кодом страниц; расчёт показан в комментариях. Значения КПД классов
// выписаны вручную из таблиц 1–3 Регламента (ЕС) 2019/1781, а не из
// data_m.py.
// ===========================================================================

// --- 1. podbor-chastotnogo-preobrazovatelya: практика Danfoss / ABB ---
// Эталон 1: постоянный момент, 15 А → HD ≥ 15 А, кратковременно 15·1,5 = 22,5 А.
await calculate("podbor-chastotnogo-preobrazovatelya.html", {}, ["Выход ПЧ для этой сети3 × 380–480 В", "Напряжение двигателя400 В — в пределах выхода ПЧ", "Требуемый кратковременный ток22,5 А (150 % на 60 с)", "Минимальный номинальный ток ПЧ в режиме HD15 А", "СтатусОценка: номинальный ток ПЧ в режиме HD — не меньше 15 А"]);
// Эталон 2: вентилятор — ND, 110 %: 15·1,1 = 16,5 А.
await calculate("podbor-chastotnogo-preobrazovatelya.html", { load: "fan" }, ["нормальная перегрузка (ND): 110 % тока ПЧ на 60 с", "Требуемый кратковременный ток16,5 А (110 % на 60 с)", "Минимальный номинальный ток ПЧ в режиме ND15 А", "СтатусОценка: номинальный ток ПЧ в режиме ND — не меньше 15 А", "момент растёт с квадратом скорости"]);
// Эталон 3: тяжёлый пуск 180 % на 30 с: 15·1,8 = 27 А; ток ПЧ HD ≥ 15·180/150 = 18 А.
await calculate("podbor-chastotnogo-preobrazovatelya.html", { load: "heavy", kp: "180", tp: "30" }, ["Требуемый кратковременный ток27 А (180 % на 30 с)", "Минимальный номинальный ток ПЧ в режиме HD18 А", "СтатусОценка: номинальный ток ПЧ в режиме HD — не меньше 18 А", "150 % его тока покрывали требуемые 180 %"]);
// Рискованный вердикт: перегрузка дольше 60 с — без «Оценка», с запасом 15·2 = 30 А.
await calculateWithout("podbor-chastotnogo-preobrazovatelya.html", { load: "heavy", kp: "200", tp: "90" }, ["С запасом: номинальный ток ПЧ, если перегрузку считать длительной30 А", "СтатусНедостаточно данных: перегрузка дольше 60 с — нужна кривая перегрузки конкретного ПЧ; с запасом номинальный ток не меньше 30 А"], ["Оценка:"]);
// Напряжение двигателя вне класса: 230 В при сети 380–480 В — вывода нет.
await calculateWithout("podbor-chastotnogo-preobrazovatelya.html", { um: "230" }, ["Напряжение двигателя230 В — вне выхода ПЧ 380–480 В", "СтатусНедостаточно данных: напряжение двигателя 230 В вне выходного диапазона ПЧ 380–480 В"], ["Оценка:"]);
await calculate("podbor-chastotnogo-preobrazovatelya.html", { set: "1x240", um: "230", im: "8,5" }, ["Выход ПЧ для этой сети3 × 200–240 В от однофазной сети", "Минимальный номинальный ток ПЧ в режиме HD8,5 А", "Однофазный вход допускается только у ПЧ"]);
await calculate("podbor-chastotnogo-preobrazovatelya.html", { set: "3x240", um: "230", im: "8,5" }, ["Выход ПЧ для этой сети3 × 200–240 В", "СтатусОценка: номинальный ток ПЧ в режиме HD — не меньше 8,5 А"]);
await calculate("podbor-chastotnogo-preobrazovatelya.html", { set: "3x690", um: "690", im: "40" }, ["Выход ПЧ для этой сети3 × 525–690 В", "СтатусОценка: номинальный ток ПЧ в режиме HD — не меньше 40 А"]);
await calculateWithout("podbor-chastotnogo-preobrazovatelya.html", { env: "derate" }, ["СтатусНедостаточно данных: выше 40 °C или 1000 м ток ПЧ снижают по графику производителя; до снижения — не меньше 15 А в режиме HD"], ["Оценка:"]);
// Границы: 150 % и 60 с включаются в типовую характеристику, 150,01 % — уже нет
// (15·150,01/150 = 15,001 А, показано по ту же сторону от 15 А), 60,01 с — «Недостаточно данных».
await calculate("podbor-chastotnogo-preobrazovatelya.html", { load: "heavy", kp: "150", tp: "60" }, ["Минимальный номинальный ток ПЧ в режиме HD15 А", "СтатусОценка"], "boundary");
await calculate("podbor-chastotnogo-preobrazovatelya.html", { load: "heavy", kp: "150,01", tp: "60" }, ["Минимальный номинальный ток ПЧ в режиме HD15,001 А", "СтатусОценка: номинальный ток ПЧ в режиме HD — не меньше 15,001 А"], "boundary");
await calculateWithout("podbor-chastotnogo-preobrazovatelya.html", { load: "heavy", kp: "150", tp: "60,01" }, ["СтатусНедостаточно данных: перегрузка дольше 60 с"], ["Оценка:"], "boundary");
await calculate("podbor-chastotnogo-preobrazovatelya.html", { um: "380" }, ["380 В — в пределах выхода ПЧ"], "boundary");
await calculate("podbor-chastotnogo-preobrazovatelya.html", { um: "480" }, ["480 В — в пределах выхода ПЧ"], "boundary");
await calculate("podbor-chastotnogo-preobrazovatelya.html", { um: "379,9" }, ["379,9 В — вне выхода ПЧ 380–480 В", "СтатусНедостаточно данных"], "boundary");
await calculate("podbor-chastotnogo-preobrazovatelya.html", { um: "480,1" }, ["480,1 В — вне выхода ПЧ 380–480 В", "СтатусНедостаточно данных"], "boundary");
await invalid("podbor-chastotnogo-preobrazovatelya.html", { im: "15 А" }, "Введите номинальный ток и номинальное напряжение двигателя");
await invalid("podbor-chastotnogo-preobrazovatelya.html", { im: "0" }, "должны быть больше нуля");
await invalid("podbor-chastotnogo-preobrazovatelya.html", { load: "heavy", kp: "100" }, "больше 100 %");
await invalid("podbor-chastotnogo-preobrazovatelya.html", { load: "heavy", tp: "0" }, "Длительность перегрузки должна быть больше нуля");
await invalid("podbor-chastotnogo-preobrazovatelya.html", { load: "heavy", kp: "сто" }, "Введите требуемый кратковременный ток");

// --- 2. tormoznoy-rezistor-chrp: Danfoss MCE 101, Siemens MM440 ---
// Эталон 1 (пример на странице): 7500·0,9·0,98 = 6615 Вт; Rmax = 778²/6615 = 91,50 Ом;
// ток 778/91,5 = 8,503 А, 778/30 = 25,93 А; ПВ 12/60 = 20 %; Pср = 1323 Вт; W = 79,38 кДж.
await calculate("tormoznoy-rezistor-chrp.html", {}, ["Мощность в звене постоянного тока P = Pмех·ηдв·ηПЧ6,615 кВт", "Uторм778 В", "Rmax = Uторм² / P91,5 Ом", "Ток ключа при Rmax и при Rmin8,503 А и 25,93 А", "ПВ = tт / tц20 %", "Pср = P·ПВ1,323 кВт", "Энергия одного торможения P·tт79,38 кДж", "СтатусОценка: сопротивление от 30 до 91,5 Ом, средняя мощность не меньше 1,323 кВт, пиковая — 6,615 кВт"]);
// Эталон 2: момент 50 Н·м при 1500 об/мин: 50·2π·1500/60 = 7854 Вт; ·0,882 = 6927 Вт;
// MM440 при 400 В: 1,13·√2·400 = 639,2 В; Rmax = 639,2²/6927 = 58,99 Ом; 639,2/30 = 21,31 А.
await calculate("tormoznoy-rezistor-chrp.html", { mode: "mech", mt: "50", n: "1500", thr: "mm", us: "400" }, ["Механическая тормозная мощность на валу7,854 кВт", "6,927 кВт", "Uторм639,2 В (1,13·√2·400 В — Siemens MICROMASTER 440)", "Rmax = Uторм² / P58,99 Ом", "10,84 А и 21,31 А", "СтатусОценка: сопротивление от 30 до 58,99 Ом"]);
// Эталон 3: 2,2 кВт, 150 %, FC 102 на 230 В (390 В): 2200·1,5·0,882 = 2911 Вт; Rmax = 390²/2911 = 52,26 Ом;
// 5 с из 20 — ПВ 25 %, Pср = 727,6 Вт, W = 14,55 кДж.
await calculate("tormoznoy-rezistor-chrp.html", { pm: "2,2", mbr: "150", thr: "d240", rmin: "20", tb: "5", tc: "20" }, ["2,911 кВт", "Uторм390 В", "Rmax = Uторм² / P52,26 Ом", "ПВ = tт / tц25 %", "Pср = P·ПВ727,6 Вт", "P·tт14,55 кДж", "СтатусОценка: сопротивление от 20 до 52,26 Ом"]);
// Рискованный вердикт: 160 % и Rmin 60 Ом — Rmax = 778²/10584 = 57,19 Ом < 60; ключ пропустит 778²/60 = 10,09 кВт.
await calculateWithout("tormoznoy-rezistor-chrp.html", { mbr: "160", rmin: "60" }, ["Rmax = Uторм² / P57,19 Ом", "СтатусТребуемое сопротивление меньше Rmin: тормозной ключ этого ПЧ не обеспечит заданную тормозную мощность", "Uторм² / Rmin = 10,09 кВт — меньше требуемых 10,58 кВт"], ["Оценка:"]);
// Граница: 10 кВт, КПД 100 %, порог 700 В → Rmax = 49 Ом ровно; Rmin 49 — включается, 49,01 — нет.
await calculate("tormoznoy-rezistor-chrp.html", { pm: "10", etm: "100", eti: "100", thr: "own", ubr: "700", rmin: "49" }, ["Rmax = Uторм² / P49 Ом", "СтатусОценка: сопротивление от 49 до 49 Ом"], "boundary");
await calculateWithout("tormoznoy-rezistor-chrp.html", { pm: "10", etm: "100", eti: "100", thr: "own", ubr: "700", rmin: "49,01" }, ["Rmax = Uторм² / P49 Ом", "Rmin по руководству ПЧ49,01 Ом", "СтатусТребуемое сопротивление меньше Rmin", "9,998 кВт — меньше требуемых 10 кВт"], ["Оценка:"], "boundary");
await calculate("tormoznoy-rezistor-chrp.html", { tb: "60", tc: "60" }, ["ПВ = tт / tц100 %", "Pср = P·ПВ6,615 кВт", "ПВ 100 %: торможение длительное"], "boundary");
await invalid("tormoznoy-rezistor-chrp.html", { tb: "60,01", tc: "60" }, "не может быть больше периода цикла");
await invalid("tormoznoy-rezistor-chrp.html", { eti: "100,1" }, "КПД задаётся в процентах");
await invalid("tormoznoy-rezistor-chrp.html", { etm: "0" }, "КПД задаётся в процентах");
await invalid("tormoznoy-rezistor-chrp.html", { rmin: "0" }, "Сопротивление Rmin должно быть больше нуля");
await invalid("tormoznoy-rezistor-chrp.html", { pm: "7,5 кВт" }, "Введите мощность двигателя");
await invalid("tormoznoy-rezistor-chrp.html", { thr: "own", ubr: "-780" }, "Порог включения должен быть больше нуля");
await invalid("tormoznoy-rezistor-chrp.html", { mode: "mech", n: "0" }, "Тормозной момент и частота вращения должны быть больше нуля");

// --- 3. kpd-dvigatelya-ie: Регламент (ЕС) 2019/1781, табл. 1–3 ---
// Эталон 1: 11 кВт, 4 полюса: IE2 89,8 %, IE3 91,4 % (табл. 1 и 2).
// 11/0,898 = 12,25; 11/0,914 = 12,04; разница 0,2144 кВт; ·4000 = 857,7 кВт·ч; ·7 = 6004 ₽.
await calculate("kpd-dvigatelya-ie.html", {}, ["Строка таблицы11 кВт, 4 полюса, 50 Гц", "Минимальный КПД IE289,8 %", "Минимальный КПД IE391,4 %", "12,25 / 12,04 кВт", "1,249 / 1,035 кВт", "Снижение потребляемой мощности0,2144 кВт", "Экономия энергии за год857,7 кВт·ч", "Экономия за год6004 ₽", "СтатусОценка: экономия около 857,7 кВт·ч в год"]);
// Эталон 2: 7,5 кВт, 2 полюса, паспортный КПД 86 % → IE4 91,7 % (табл. 3):
// 8,721 и 8,179 кВт, разница 0,5421 кВт, ·6000 = 3253 кВт·ч, ·5 = 16260 ₽.
await calculate("kpd-dvigatelya-ie.html", { p: "7,5", pol: "2", cold: "own", etaold: "86", cnew: "ie4", h: "6000", tar: "5" }, ["КПД старого двигателя (задан)86 %", "Минимальный КПД IE491,7 %", "8,721 / 8,179 кВт", "0,5421 кВт", "3253 кВт·ч", "16260 ₽", "задан вами"]);
// Эталон 3: 315 кВт, 6 полюсов — строка «200 up to 1000»: IE3 95,8, IE4 96,3 %.
await calculate("kpd-dvigatelya-ie.html", { p: "315", pol: "6", cold: "ie3", cnew: "ie4", h: "8000", tar: "6" }, ["Строка таблицы200–1000 кВт, 6 полюсов", "Минимальный КПД IE395,8 %", "Минимальный КПД IE496,3 %", "328,8 / 327,1 кВт", "1,707 кВт", "13660 кВт·ч", "81950 ₽"]);
// Контрольные строки таблиц, выписанные из выдачи вручную.
await calculate("kpd-dvigatelya-ie.html", { p: "0,75", pol: "2", cold: "ie2", cnew: "ie3" }, ["Минимальный КПД IE277,4 %", "Минимальный КПД IE380,7 %"]);
await calculate("kpd-dvigatelya-ie.html", { p: "0,75", pol: "4", cold: "ie3", cnew: "ie4" }, ["Минимальный КПД IE382,5 %", "Минимальный КПД IE485,7 %"]);
await calculate("kpd-dvigatelya-ie.html", { p: "0,75", pol: "6", cold: "ie2", cnew: "ie3" }, ["Минимальный КПД IE275,9 %", "Минимальный КПД IE378,9 %"]);
await calculate("kpd-dvigatelya-ie.html", { p: "75", pol: "2", cold: "ie3", cnew: "ie4" }, ["Минимальный КПД IE394,7 %", "Минимальный КПД IE495,6 %"]);
await calculate("kpd-dvigatelya-ie.html", { p: "18,5", pol: "2", cold: "ie2", cnew: "ie4" }, ["Минимальный КПД IE290,9 %", "Минимальный КПД IE493,7 %"]);
// Эталон 4: 0,12 кВт, 2 полюса IE2 53,6 → IE3 60,8, 2000 ч, 7 ₽: 0,02651 кВт, 53,02 кВт·ч, 371,2 ₽.
await calculate("kpd-dvigatelya-ie.html", { p: "0,12", pol: "2", h: "2000" }, ["Минимальный КПД IE253,6 %", "Минимальный КПД IE360,8 %", "0,02651 кВт", "53,02 кВт·ч", "371,2 ₽"], "boundary");
// Рискованный вердикт: мощности нет в таблице — без интерполяции и без экономии.
await calculateWithout("kpd-dvigatelya-ie.html", { p: "10" }, ["Ближайшие строки таблицы7,5 кВт и 11 кВт", "Минимальный КПД IE3 для них, 4 полюса90,4 % и 91,4 %", "СтатусНедостаточно данных: мощности 10 кВт нет в таблице IEC 60034-30-1 — интерполяция не выполняется"], ["Экономия", "Оценка"]);
await calculateWithout("kpd-dvigatelya-ie.html", { p: "199,9" }, ["Ближайшие строки таблицы160 кВт и 200–1000 кВт", "СтатусНедостаточно данных"], ["Экономия"], "boundary");
await calculate("kpd-dvigatelya-ie.html", { p: "200" }, ["Строка таблицы200–1000 кВт, 4 полюса", "Минимальный КПД IE295,1 %", "Минимальный КПД IE396 %"], "boundary");
await calculate("kpd-dvigatelya-ie.html", { p: "1000" }, ["Строка таблицы200–1000 кВт"], "boundary");
await calculateWithout("kpd-dvigatelya-ie.html", { cold: "ie4", cnew: "ie3" }, ["СтатусОценка: новый двигатель по минимальному КПД класса IE3 не лучше старого — экономии нет"], ["Экономия энергии за год"]);
await invalid("kpd-dvigatelya-ie.html", { p: "0,11" }, "от 0,12 до 1000 кВт");
await invalid("kpd-dvigatelya-ie.html", { p: "1000,1" }, "от 0,12 до 1000 кВт");
await invalid("kpd-dvigatelya-ie.html", { h: "8761" }, "от 0 до 8760 ч");
await invalid("kpd-dvigatelya-ie.html", { cold: "own", etaold: "100" }, "меньше 100");
await invalid("kpd-dvigatelya-ie.html", { cold: "own", etaold: "восемьдесят" }, "Введите КПД старого двигателя");
await invalid("kpd-dvigatelya-ie.html", { tar: "-1" }, "Тариф не может быть отрицательным");

// --- 4. privedennyy-moment-inercii: J/i², m(v/ω)², Mс/(i·η) ---
// Эталон 1: ω = 2π·1450/60 = 151,8; 20/10² = 0,2; Σ = 0,04+0,002+0,2 = 0,242; 0,2/0,04 = 5;
// Mс = 200/(10·0,95) = 21,05; Mдин = 38,95; t = 0,242·151,8/38,95 = 0,9435 с; E = 2,79 кДж.
await calculate("privedennyy-moment-inercii.html", {}, ["ω = 2πn / 60151,8 рад/с", "Jн / i²0,2 кг·м²", "Суммарный момент инерции на валу двигателя0,242 кг·м²", "Отношение приведённой инерции нагрузки к ротору5", "Mс / (i·η)21,05 Н·м", "Кинетическая энергия при 1450 об/мин2,79 кДж", "Mдв − Mс,пр38,95 Н·м", "t = J·ω / Mдин943,5 мс", "СтатусОценка: время разгона около 943,5 мс при постоянных моментах"]);
// Эталон 2: тележка 500 кг, 1,2 м/с при 1500 об/мин (ω = 157,1): 500·(1,2/157,1)² = 0,02918;
// Σ = 0,1292; отношение 0,2918; t = 0,1292·157,1/50 = 0,4058 с; E = 1,594 кДж.
await calculate("privedennyy-moment-inercii.html", { jm: "0,1", jg: "0", jl: "0", i: "20", m: "500", v: "1,2", n: "1500", mm: "50", ml: "0" }, ["m·(v/ω)²0,02918 кг·м²", "Суммарный момент инерции на валу двигателя0,1292 кг·м²", "к ротору0,2918", "405,8 мс", "1,594 кДж"]);
// Эталон 3: повышающая передача i = 0,5 — инерция 1 кг·м² даёт 1/0,25 = 4 кг·м².
await calculate("privedennyy-moment-inercii.html", { jl: "1", i: "0,5", ml: "0" }, ["Jн / i²4 кг·м²", "к ротору100"]);
// Рискованный вердикт: 200/(10·0,95) = 21,05 при моменте двигателя 20 — разгона нет.
await calculateWithout("privedennyy-moment-inercii.html", { mm: "20" }, ["СтатусДвигатель не разгонит привод: приведённый момент сопротивления 21,05 Н·м не меньше среднего момента двигателя 20 Н·м"], ["t = J·ω / Mдин", "Оценка:"]);
// Граница: η = 100 %, 190/10 = 19 Н·м; момент двигателя 19 — разгона нет, 19,01 — t ≈ 3675 с = 1,02 ч.
await calculateWithout("privedennyy-moment-inercii.html", { ml: "190", eta: "100", mm: "19" }, ["СтатусДвигатель не разгонит привод"], ["t = J·ω / Mдин"], "boundary");
await calculate("privedennyy-moment-inercii.html", { ml: "190", eta: "100", mm: "19,01" }, ["Mс / (i·η)19 Н·м", "t = J·ω / Mдин1,02 ч"], "boundary");
await invalid("privedennyy-moment-inercii.html", { i: "0" }, "Передаточное число должно быть больше нуля");
await invalid("privedennyy-moment-inercii.html", { jm: "0" }, "Момент инерции ротора должен быть больше нуля");
await invalid("privedennyy-moment-inercii.html", { v: "-1" }, "не могут быть отрицательными");
await invalid("privedennyy-moment-inercii.html", { eta: "101" }, "КПД редуктора задаётся в процентах");
await invalid("privedennyy-moment-inercii.html", { m: "" }, "Заполните все поля числами");

// --- 5. klinoremennaya-peredacha: ГОСТ 1284.3-96, геометрия открытой передачи ---
// Эталон 1: 125/250 мм, a = 400: Lp = 800 + π·375/2 + 125²/1600 = 1398,81 мм; точная 1398,83;
// α = 180 − 2·arcsin(125/800) = 162,0°; приближённо 180 − 57·125/400 = 162,2°;
// n2 = 1450·125·0,99/250 = 717,8; u = 250/(125·0,99) = 2,02; v = π·0,125·1450/60 = 9,49 м/с.
await calculate("klinoremennaya-peredacha.html", {}, ["d2 / d12", "d2 / (d1·(1 − ε))2,02", "Частота вращения ведомого шкива717,8 об/мин", "v = π·d1·n1 / 600009,49 м/с", "Расчётная длина ремня Lp (ГОСТ 1284.3-96)1398,81 мм", "точная длина по геометрии1398,83 мм", "arcsin(|d2 − d1| / 2a)162°", "57°·|d2 − d1| / a162,2°", "СтатусОценка: угол обхвата малого шкива 162° — не меньше рекомендуемых 120°"]);
// Эталон 2 (обратная задача): Lp = 1400 мм → a = [(1400 − 589,05) + √(810,95² − 2·125²)]/4 = 400,6 мм.
await calculate("klinoremennaya-peredacha.html", { mode: "l", lp: "1400" }, ["Межосевое расстояние a400,6 мм", "162°", "запас межосевого расстояния на натяжение"]);
// Эталон 3: равные шкивы 200/200, a = 500: L = 1000 + 200π = 1628,32 мм, угол 180°.
await calculate("klinoremennaya-peredacha.html", { d1: "200", d2: "200", a: "500" }, ["Lp (ГОСТ 1284.3-96)1628,32 мм", "arcsin(|d2 − d1| / 2a)180°", "СтатусОценка"]);
// Граница 120°: 100/400 мм, a = 300: arcsin(0,5) = 30°, α = 120° — включается; L = 600 + 250π + 75 = 1460,4;
// ε = 2 %, n1 = 2900: n2 = 2900·100·0,98/400 = 710,5; v = 15,18 м/с; u = 4,082; приближённо 123°.
await calculate("klinoremennaya-peredacha.html", { d1: "100", d2: "400", a: "300", n1: "2900", eps: "2" }, ["1460,4 мм", "710,5 об/мин", "15,18 м/с", "d2 / (d1·(1 − ε))4,082", "a123°", "СтатусОценка: угол обхвата малого шкива 120° — не меньше рекомендуемых 120°"], "boundary");
await calculateWithout("klinoremennaya-peredacha.html", { d1: "100", d2: "400", a: "299" }, ["СтатусУгол обхвата малого шкива 119,8° меньше рекомендуемых 120°"], ["Оценка:"], "boundary");
// Ведущий шкив больше ведомого — угол по малому шкиву тот же: 250/125, a = 400 → 162°, n2 = 1450·250·0,99/125 = 2871.
await calculate("klinoremennaya-peredacha.html", { d1: "250", d2: "125" }, ["2871 об/мин", "162°", "Lp (ГОСТ 1284.3-96)1398,81 мм"]);
await invalid("klinoremennaya-peredacha.html", { a: "187,5" }, "больше полусуммы диаметров (d1 + d2) / 2 = 187,5 мм");
await invalid("klinoremennaya-peredacha.html", { mode: "l", lp: "984" }, "слишком короток");
await invalid("klinoremennaya-peredacha.html", { eps: "100" }, "Скольжение задаётся в процентах");
await invalid("klinoremennaya-peredacha.html", { d1: "0" }, "Диаметры и частота вращения должны быть больше нуля");
await invalid("klinoremennaya-peredacha.html", { n1: "1450 об/мин" }, "Введите диаметры шкивов");

// Каждый переключатель влияет на расчёт и скрывает ненужные поля (правило 7).
{
  kind = "structural";
  const vis = (d, id) => d.getElementById(`f_${id}`)?.style.display !== "none";
  const change = (dom, id, value) => { const el = dom.window.document.getElementById(id); el.value = value; el.dispatchEvent(new dom.window.Event("change", { bubbles: true })); };
  let dom = await load("podbor-chastotnogo-preobrazovatelya.html"); let d = dom.window.document;
  check(!vis(d, "kp") && !vis(d, "tp"), "podbor-chastotnogo-preobrazovatelya: перегрузка вне режима тяжёлого пуска не влияет на расчёт и должна быть скрыта");
  change(dom, "load", "heavy");
  check(vis(d, "kp") && vis(d, "tp"), "podbor-chastotnogo-preobrazovatelya: в режиме тяжёлого пуска поля перегрузки должны быть видны");
  dom.window.close();
  dom = await load("tormoznoy-rezistor-chrp.html"); d = dom.window.document;
  check(vis(d, "pm") && vis(d, "mbr") && !vis(d, "mt") && !vis(d, "n") && !vis(d, "us") && !vis(d, "ubr"), "tormoznoy-rezistor-chrp: в режиме «в процентах» с порогом Danfoss видны только мощность и момент в %");
  change(dom, "mode", "mech"); change(dom, "thr", "mm");
  check(!vis(d, "pm") && vis(d, "mt") && vis(d, "n") && vis(d, "us") && !vis(d, "ubr"), "tormoznoy-rezistor-chrp: режим Н·м и порог MM440 должны показывать свои поля");
  change(dom, "thr", "own");
  check(!vis(d, "us") && vis(d, "ubr"), "tormoznoy-rezistor-chrp: для своего порога должно быть видно только поле порога");
  dom.window.close();
  dom = await load("kpd-dvigatelya-ie.html"); d = dom.window.document;
  check(!vis(d, "etaold"), "kpd-dvigatelya-ie: поле своего КПД не влияет на расчёт по классу и должно быть скрыто");
  change(dom, "cold", "own");
  check(vis(d, "etaold"), "kpd-dvigatelya-ie: при своём КПД поле должно быть видно");
  dom.window.close();
  dom = await load("klinoremennaya-peredacha.html"); d = dom.window.document;
  check(vis(d, "a") && !vis(d, "lp"), "klinoremennaya-peredacha: в режиме межосевого расстояния длина скрыта");
  change(dom, "mode", "l");
  check(!vis(d, "a") && vis(d, "lp"), "klinoremennaya-peredacha: в режиме длины скрыто межосевое расстояние");
  dom.window.close();
}

// Семантика: что источник не подтверждает, не выдаётся за норму.
{
  kind = "structural";
  const text = file => fs.readFileSync(path.join(sourceDir, file), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const pages = ["podbor-chastotnogo-preobrazovatelya", "tormoznoy-rezistor-chrp", "kpd-dvigatelya-ie", "privedennyy-moment-inercii", "klinoremennaya-peredacha"];
  const registry = fs.readFileSync(path.join(sourceDir, "ENGINEERING_AUDIT.md"), "utf8");
  for (const slug of pages) {
    const t = text(`${slug}.html`);
    check(!/проходит|безопасно|соответствует нормам/i.test(t), `${slug}: запрещённая формулировка вердикта`);
    check(/Оценка, не нормативный вердикт/.test(t) && /Границы применимости/.test(t) && /Редакция/.test(t) && /обращение 30\.09\.2026/.test(t),
      `${slug}: карточка источника без статуса, редакции, даты обращения или границ`);
    check(registry.includes(`\`${slug}\``), `ENGINEERING_AUDIT.md: нет записи о ${slug}`);
  }
  const ie = text("kpd-dvigatelya-ie.html");
  check(/не интерполир/.test(ie) && /IE1 не табулирован|Почему нет IE1/.test(ie) && /2019\/1781/.test(ie),
    "kpd-dvigatelya-ie: не сказано про отказ от интерполяции, отсутствие IE1 или источник таблиц");
  const br = text("tormoznoy-rezistor-chrp.html");
  check(/778 В/.test(br) && /1,13·√2/.test(br) && /порядок величины/.test(br),
    "tormoznoy-rezistor-chrp: пороги ключа должны быть приписаны производителям, а оценка 1,35·U — названа порядком величины");
  const belt = text("klinoremennaya-peredacha.html");
  check(/ГОСТ 1284\.3-96/.test(belt) && /учебной литератур/.test(belt),
    "klinoremennaya-peredacha: рекомендация 120° приписана ГОСТ, а не учебной литературе");

}

// --- Партия №3, data_n.py ---
// ===========================================================================
// «Электродвигатели и приводы»: автомат для двигателя, пуск через
// автотрансформатор, уставка теплового реле, индивидуальная компенсация,
// синхронная скорость и скольжение. Эталоны посчитаны отдельным скриптом
// (scratchpad batch3/ref.py) и вручную — расчёт приведён в комментариях;
// округление как в fmt(): 4 значащие цифры, запятая.
// ===========================================================================

// --- avtomat-dlya-dvigatelya: ГОСТ IEC 60898-1-2020 (B/C/D), K по ABB ---
// Эталон 1: Iн = 10 А, Kп = 6 → Iп = 60 А; бросок 2·Iп = 120 А; C16: 120/16 = 7,5 — между 5 и 10 → зона разброса;
// наименьший номинал 120/5 = 24 А.
await calculateWithout("avtomat-dlya-dvigatelya.html", {}, ["Пусковой ток Iп = Kп·Iн60 А", "Наибольший бросок в первый полупериод, 2·Iп120 А", "Кратность броска к номиналу автомата7,5", "Зона мгновенного расцепления Cсвыше 5·In до 10·In (80…160 А)", "Наименьший номинал, при котором бросок не выше 5·In24 А", "Мгновенный расцепитель при пускеможет отключить", "СтатусРиск ложного отключения при пуске: бросок в зоне разброса мгновенного расцепителя", "автомат защиты двигателя"], ["Статус Оценка", "СтатусОценка"]);
// Эталон 2: без броска 60/16 = 3,75 ≤ 5 → мгновенный не сработает; кривой нет → «Недостаточно данных»; 60/5 = 12 А.
await calculateWithout("avtomat-dlya-dvigatelya.html", { asym: "1" }, ["Кратность броска к номиналу автомата3,75", "Наименьший номинал, при котором бросок не выше 5·In12 А", "Мгновенный расцепитель при пускене отключит: бросок не выше нижней границы зоны 5·In", "Тепловой расцепитель при пускенет данных", "СтатусНедостаточно данных: от мгновенного расцепления пуск отстроен", "Бросок первого полупериода не учтён"], ["Наибольший бросок", "СтатусОценка"]);
// D16: 7,5 ≤ 10 → мгновенный отстроен; 120/10 = 12 А; без кривой — рискованный вердикт запрещён.
await calculateWithout("avtomat-dlya-dvigatelya.html", { tip: "D" }, ["свыше 10·In до 20·In (160…320 А)", "Наименьший номинал, при котором бросок не выше 10·In12 А", "СтатусНедостаточно данных", "Граница 20·In для D должна подтверждаться паспортом"], ["СтатусОценка", "Автомат отключится"]);
// По кривой изготовителя: tп = 5 с < 8 с → укладывается; 5 = 5 → отключит; 5 < 5,01 → укладывается.
await calculateWithout("avtomat-dlya-dvigatelya.html", { tip: "D", tcur: "8" }, ["Тепловой расцепитель при пускене отключит из холодного состояния: время пуска 5 с меньше времени по кривой 8 с", "СтатусОценка: пуск не попадает в зону мгновенного расцепления и укладывается во введённую кривую изготовителя"], ["бросок первого полупериода не учтён", "автомат защиты двигателя"]);
await calculate("avtomat-dlya-dvigatelya.html", { tip: "D", tcur: "5" }, ["отключит: время пуска 5 с не меньше времени по кривой 5 с", "СтатусТепловой расцепитель отключит при пуске по введённой кривой изготовителя"], "boundary");
await calculate("avtomat-dlya-dvigatelya.html", { tip: "D", tcur: "5,01" }, ["СтатусОценка: пуск не попадает в зону мгновенного расцепления"], "boundary");
await calculate("avtomat-dlya-dvigatelya.html", { tip: "D", tcur: "8", asym: "1" }, ["СтатусОценка: пуск не попадает в зону мгновенного расцепления и укладывается во введённую кривую изготовителя; бросок первого полупериода не учтён"]);
// Нижняя граница C: 80/16 = 5 → ещё вне зоны; 80,1/16 = 5,006 → в зоне; наименьший номинал 16 и 16,02 А.
await calculate("avtomat-dlya-dvigatelya.html", { asym: "1", kp: "8" }, ["Кратность броска к номиналу автомата5", "бросок не выше 5·In16 А", "СтатусНедостаточно данных"], "boundary");
await calculate("avtomat-dlya-dvigatelya.html", { asym: "1", kp: "8,01" }, ["Кратность броска к номиналу автомата5,006", "бросок не выше 5·In16,02 А", "СтатусРиск ложного отключения при пуске"], "boundary");
// Верхняя граница C с броском: 2·80/16 = 10, но действующий ток 80/16 = 5 < 10 — только риск, без категоричного
// «отключится» (находка независимого проверяющего, правило 6); 2·79,9/16 = 9,988 → зона разброса.
await calculateWithout("avtomat-dlya-dvigatelya.html", { kp: "8" }, ["Кратность броска к номиналу автомата10", "может отключить: действующий пусковой ток ниже 10·In", "СтатусРиск отключения при пуске: действующий пусковой ток ниже 10·In"], ["отключится"], "boundary");
// Категорично — только по действующему значению: 16·10/16 = 10 → отключится; 15,99·10/16 = 9,994 → зона разброса.
await calculate("avtomat-dlya-dvigatelya.html", { asym: "1", kp: "16" }, ["отключит: действующий пусковой ток не ниже 10·In", "СтатусАвтомат отключится при пуске"], "boundary");
await calculateWithout("avtomat-dlya-dvigatelya.html", { asym: "1", kp: "15,99" }, ["СтатусРиск ложного отключения при пуске"], ["отключится"], "boundary");
await calculate("avtomat-dlya-dvigatelya.html", { kp: "16" }, ["СтатусАвтомат отключится при пуске"], "boundary");
// Время у порога не округляется через него: 5 с против 5,0001 с.
await calculate("avtomat-dlya-dvigatelya.html", { asym: "1", tp: "5", tcur: "5,0001" }, ["время пуска 5 с меньше времени по кривой 5,0001 с"], "boundary");
await calculate("avtomat-dlya-dvigatelya.html", { kp: "7,99" }, ["Кратность броска к номиналу автомата9,988", "СтатусРиск ложного отключения при пуске"], "boundary");
// In = 16 < Iн = 20 → не подходит, даже если остальное считается.
await calculate("avtomat-dlya-dvigatelya.html", { im: "20" }, ["СтатусНе подходит: номинал автомата In меньше номинального тока двигателя", "Условие IB ≤ In не выполнено"]);
// K (ABB, 8…14·In), In = 10: без броска 60/10 = 6 ≤ 8; с броском 12 — между 8 и 14.
await calculate("avtomat-dlya-dvigatelya.html", { tip: "K", inb: "10", asym: "1" }, ["Зона мгновенного расцепления K (по данным ABB)свыше 8·In до 14·In (80…140 А)", "Кратность броска к номиналу автомата6", "СтатусНедостаточно данных", "Характеристика K не входит в МЭК 60898"]);
await calculate("avtomat-dlya-dvigatelya.html", { tip: "K", inb: "10" }, ["Кратность броска к номиналу автомата12", "Наименьший номинал, при котором бросок не выше 8·In15 А", "СтатусРиск ложного отключения при пуске"]);
// D против D без паспорта: 2·17,5·10/10 = 35 → для D (до 20) отключит, для D50 (до 50) — зона разброса.
await calculateWithout("avtomat-dlya-dvigatelya.html", { tip: "D", kp: "17,5", inb: "10" }, ["Кратность броска к номиналу автомата35", "СтатусРиск отключения при пуске: действующий пусковой ток ниже 20·In"], ["отключится"]);
await calculate("avtomat-dlya-dvigatelya.html", { tip: "D", kp: "20", inb: "10", asym: "1" }, ["СтатусАвтомат отключится при пуске"], "boundary");
await calculate("avtomat-dlya-dvigatelya.html", { tip: "D50", kp: "17,5", inb: "10" }, ["свыше 10·In до 50·In (100…500 А)", "СтатусРиск ложного отключения при пуске", "взята 50·In"]);
// B16 без броска: 60/16 = 3,75 — между 3 и 5; наименьший номинал 60/3 = 20 А.
await calculate("avtomat-dlya-dvigatelya.html", { tip: "B", asym: "1" }, ["Кратность броска к номиналу автомата3,75", "Наименьший номинал, при котором бросок не выше 3·In20 А", "СтатусРиск ложного отключения при пуске"]);
await invalid("avtomat-dlya-dvigatelya.html", { im: "abc" }, "Заполните номинальный ток двигателя");
await invalid("avtomat-dlya-dvigatelya.html", { tcur: "пять" }, "Время отключения по кривой изготовителя — число в секундах");
await invalid("avtomat-dlya-dvigatelya.html", { tcur: "0" }, "Время отключения по кривой изготовителя должно быть больше нуля");
await invalid("avtomat-dlya-dvigatelya.html", { kp: "0,5" }, "Кратность пускового тока Iп/Iн не может быть меньше 1");
await invalid("avtomat-dlya-dvigatelya.html", { tp: "0" }, "Время пуска должно быть больше нуля");
await invalid("avtomat-dlya-dvigatelya.html", { inb: "160" }, "Номинал больше 125 А");

// --- avtotransformatornyy-pusk: ток сети k²·Iп, двигателя k·Iп, момент k²·Mп ---
// Эталон 1: Iн = 50 А, Kп = 7 → 350 А, Mп = 2·Mн. Отвод 0,65: 0,4225·350 = 147,875 → 147,9 А (2,958·Iн);
// 0,65·350 = 227,5 А; 0,4225·2 = 0,845·Mн > 0,5 → оценка. Звезда-треугольник: 350/3 = 116,7 А, 2/3 = 0,6667.
await calculate("avtotransformatornyy-pusk.html", {}, ["Способ пускаАвтотрансформатор, отвод 65 %", "Пусковой ток сети147,9 А (2,958·Iн)", "Пусковой ток двигателя за автотрансформатором, k·Iп227,5 А", "Пусковой момент0,845·Mн (42,25 % от прямого пуска)", "Для сравнения: прямой пуск350 А, 2·Mн", "Для сравнения: звезда-треугольник116,7 А, 0,6667·Mн", "СтатусОценка: пусковой момент больше момента нагрузки при трогании"]);
// Эталон 2: отвод 0,5 → 0,25·350 = 87,5 А, 0,25·2 = 0,5·Mн = моменту нагрузки → не тронется (рискованный вердикт).
await calculateWithout("avtotransformatornyy-pusk.html", { met: "at50" }, ["Пусковой ток сети87,5 А (1,75·Iн)", "Пусковой момент0,5·Mн (25 % от прямого пуска)", "СтатусМомента не хватит для трогания: пусковой момент 0,5·Mн не больше момента нагрузки 0,5·Mн"], ["СтатусОценка"], "boundary");
await calculate("avtotransformatornyy-pusk.html", { met: "at50", mc: "0,49" }, ["Пусковой момент0,5·Mн", "Момент нагрузки при трогании0,49·Mн", "СтатусОценка"], "boundary");
// Отвод 0,8: 0,64·350 = 224 А (4,48·Iн), 0,8·350 = 280 А, 0,64·2 = 1,28.
await calculate("avtotransformatornyy-pusk.html", { met: "at80" }, ["отвод 80 %", "Пусковой ток сети224 А (4,48·Iн)", "k·Iп280 А", "Пусковой момент1,28·Mн (64 % от прямого пуска)"]);
// Свой отвод 0,7: 0,49·350 = 171,5 А, 0,7·350 = 245 А, 0,98·Mн.
await calculate("avtotransformatornyy-pusk.html", { met: "atk", k: "0,7" }, ["отвод 70 %", "Пусковой ток сети171,5 А (3,43·Iн)", "k·Iп245 А", "Пусковой момент0,98·Mн (49 % от прямого пуска)"]);
await calculateWithout("avtotransformatornyy-pusk.html", { met: "yd" }, ["Способ пускаЗвезда-треугольник", "Пусковой ток сети116,7 А (2,333·Iн)", "Пусковой момент0,6667·Mн (33,33 % от прямого пуска)", "400Δ/690Y", "СтатусОценка"], ["k·Iп", "Для сравнения: звезда-треугольник"]);
await calculateWithout("avtotransformatornyy-pusk.html", { met: "yd", mc: "0,7" }, ["СтатусМомента не хватит для трогания: пусковой момент 0,6667·Mн не больше момента нагрузки 0,7·Mн"], ["СтатусОценка"]);
await calculateWithout("avtotransformatornyy-pusk.html", { met: "dol" }, ["Пусковой ток сети350 А (7·Iн)", "Пусковой момент2·Mн (100 % от прямого пуска)"], ["Для сравнения: прямой пуск", "k·Iп"]);
// Сеть 80 %: ток 147,875·0,8 = 118,3 А, двигатель 227,5·0,8 = 182 А, момент 0,845·0,64 = 0,5408; 1/0,64 = 1,5625 → 1,563.
await calculate("avtotransformatornyy-pusk.html", { u: "80" }, ["Пусковой ток сети118,3 А", "k·Iп182 А", "Пусковой момент0,5408·Mн", "уменьшает ток в 1,25 раза"]);
await invalid("avtotransformatornyy-pusk.html", { mc: "x" }, "Заполните ток двигателя");
await invalid("avtotransformatornyy-pusk.html", { met: "atk", k: "1" }, "Отвод автотрансформатора k — доля напряжения сети");
await invalid("avtotransformatornyy-pusk.html", { met: "atk", k: "abc" }, "Введите отвод автотрансформатора k");
await invalid("avtotransformatornyy-pusk.html", { u: "120" }, "Напряжение сети при пуске задаётся в процентах");
await invalid("avtotransformatornyy-pusk.html", { mp: "0" }, "Кратность пускового момента должна быть больше нуля");
await invalid("avtotransformatornyy-pusk.html", { mc: "-1" }, "Момент нагрузки не может быть отрицательным");

// --- ustavka-teplovogo-rele: классы 10A/10/20/30 при 7,2·Ir (ГОСТ IEC 60947-4-1) ---
// Эталон 1: Iн = 10 А, прямой пуск 6·Iн = 60 А, кратность 6 ≤ 7,2, tп = 3 с ≤ 4 с (нижняя граница класса 10) → выдерживает;
// наименьший класс: 10A (2 с) — нет, 10 (4 с) — да.
await calculate("ustavka-teplovogo-rele.html", {}, ["Ток через реле при номинальной нагрузке10 А", "Диапазон реле9…13 А", "Уставка Ir10 А", "Ток через реле при пуске60 А", "Кратность пускового тока к уставке6", "за время больше 4 с и не больше 10 с", "Наименьший класс, гарантирующий пуск10Статус", "СтатусОценка: реле класса 10 выдерживает пуск из холодного состояния"]);
await calculateWithout("ustavka-teplovogo-rele.html", { cls: "10A" }, ["за время больше 2 с и не больше 10 с", "СтатусНедостаточно данных: при этой кратности и времени пуска нужна время-токовая кривая реле"], ["СтатусОценка", "NEC"]);
await calculateWithout("ustavka-teplovogo-rele.html", { tp: "5" }, ["Наименьший класс, гарантирующий пуск20Статус", "СтатусНедостаточно данных"], ["СтатусОценка"]);
await calculate("ustavka-teplovogo-rele.html", { tp: "5", cls: "20" }, ["СтатусОценка: реле класса 20 выдерживает пуск из холодного состояния"]);
// Эталон 2: 7,2·Iн, tп = 12 с > 10 с (верхняя граница класса 10) → отключит; для класса 30 (9…30 с) — нужна кривая.
await calculate("ustavka-teplovogo-rele.html", { kp: "7,2", tp: "12" }, ["Кратность пускового тока к уставке7,2", "Наименьший класс, гарантирующий пускни один из классов 10A–30: пуск дольше 9 с", "СтатусРеле класса 10 отключит двигатель при пуске"], "boundary");
await calculateWithout("ustavka-teplovogo-rele.html", { kp: "7,2", tp: "12", cls: "30" }, ["СтатусНедостаточно данных"], ["отключит двигатель при пуске", "СтатусОценка"]);
await calculate("ustavka-teplovogo-rele.html", { tp: "9", cls: "30" }, ["СтатусОценка: реле класса 30 выдерживает пуск"], "boundary");
await calculate("ustavka-teplovogo-rele.html", { tp: "9,01", cls: "30" }, ["ни один из классов 10A–30", "СтатусНедостаточно данных"], "boundary");
await calculateWithout("ustavka-teplovogo-rele.html", { kp: "7,21", tp: "3" }, ["Кратность пускового тока к уставке7,21", "СтатусНедостаточно данных"], ["Наименьший класс", "СтатусОценка"], "boundary");
// Звезда-треугольник, реле в фазе обмотки: 26/√3 = 15,011 → 15,01 А; на «звезде» 6·26/3 = 52 А; 52/15,011 = 3,464.
await calculate("ustavka-teplovogo-rele.html", { im: "26", sch: "ydp", rmin: "12", rmax: "18", tp: "5" }, ["Ток через реле при номинальной нагрузке, Iн/√315,01 А", "Уставка Ir15,01 А", "Ток через реле при пуске (ступень «звезда»)52 А", "Кратность пускового тока к уставке3,464", "СтатусНедостаточно данных", "уставка — Iн/√3 ≈ 0,58·Iн"]);
await calculate("ustavka-teplovogo-rele.html", { im: "26", sch: "ydp", rmin: "12", rmax: "18", tp: "5", cls: "20" }, ["СтатусОценка: реле класса 20 выдерживает пуск"]);
// Звезда-треугольник, реле в линии: Ir = 26 А (верх диапазона 18…26), на «звезде» 52/26 = 2.
await calculate("ustavka-teplovogo-rele.html", { im: "26", sch: "ydl", rmin: "18", rmax: "26" }, ["Уставка Ir26 А", "Кратность пускового тока к уставке2", "СтатусОценка: реле класса 10 выдерживает пуск"], "boundary");
await calculateWithout("ustavka-teplovogo-rele.html", { rmin: "11", rmax: "14" }, ["Уставка Irвне диапазона реле", "СтатусРеле не подходит: требуемая уставка 10 А вне диапазона"], ["СтатусОценка"]);
// NEC 430.32(A)(1): 125 % → 12,5 А, уставка — нижняя граница 11 А; кратность 60/11 = 5,455.
await calculate("ustavka-teplovogo-rele.html", { base: "nec", rmin: "11", rmax: "14" }, ["Наибольшая уставка по NEC 430.32(A)(1), 125 %12,5 А", "Уставка Ir11 А — нижняя граница диапазона, в пределах NEC", "Кратность пускового тока к уставке5,455", "СтатусОценка: реле класса 10 выдерживает пуск", "американская норма"]);
await calculate("ustavka-teplovogo-rele.html", { base: "nec", sf: "lo", rmin: "12", rmax: "14" }, ["Наибольшая уставка по NEC 430.32(A)(1), 115 %11,5 А", "СтатусРеле не подходит: в диапазоне нет уставки от 10 до 11,5 А"]);
await calculate("ustavka-teplovogo-rele.html", { base: "nec", sf: "lo", rmin: "11,5", rmax: "14" }, ["Уставка Ir11,5 А — нижняя граница диапазона, в пределах NEC", "СтатусОценка"], "boundary");
await invalid("ustavka-teplovogo-rele.html", { im: "x" }, "Заполните ток двигателя, диапазон реле");
await invalid("ustavka-teplovogo-rele.html", { rmin: "15", rmax: "13" }, "Нижняя граница диапазона реле больше верхней");
await invalid("ustavka-teplovogo-rele.html", { kp: "0" }, "Кратность пускового тока не может быть меньше 1");
await invalid("ustavka-teplovogo-rele.html", { tp: "-1" }, "Время пуска должно быть больше нуля");

// --- kompensaciya-dvigatelya: Qc ≤ 0,9·√3·U·I₀ (Schneider EIG) ---
// Эталон 1: 15 кВт, η 0,9 → P₁ = 16,67 кВт; tg φ = 0,5268/0,85 = 0,6197 → Q₁ = 10,33 кВАр; Iн = 16667/(√3·400·0,85) = 28,3 А;
// √3·400·10 = 6,928 кВАр, предел 0,9·6,928 = 6,235; Qc = 5: Q₂ = 5,329, cos φ₂ = 16,67/√(16,67² + 5,329²) = 0,9525; 0,85/0,9525 = 0,8924.
await calculate("kompensaciya-dvigatelya.html", {}, ["Потребляемая активная мощность P₁ = P/η16,67 кВт", "Реактивная мощность двигателя при номинальной нагрузке10,33 кВАр", "Номинальный ток по введённым данным28,3 А", "Реактивная мощность холостого хода ≈ √3·U·I₀6,928 кВАр", "Предел Qc ≤ 0,9·√3·U·I₀6,235 кВАр", "Заданная Qc5 кВАр", "cos φ после компенсации при номинальной нагрузке0,9525", "cos φ₁/cos φ₂0,8924", "СтатусQc в пределах 0,9·√3·U·I₀ по Schneider EIG"]);
// Эталон 2: Qc = 7 > 6,235 → риск; Q₂ = 3,329, cos φ₂ = 0,9806.
await calculateWithout("kompensaciya-dvigatelya.html", { qc: "7" }, ["cos φ после компенсации при номинальной нагрузке0,9806", "cos φ₁/cos φ₂0,8668", "СтатусQc больше предела 0,9·√3·U·I₀: риск самовозбуждения после отключения", "через отдельный контактор"], ["в пределах"]);
// Предел 6,23538 не округляется через введённое значение.
await calculate("kompensaciya-dvigatelya.html", { qc: "6,235" }, ["Предел Qc ≤ 0,9·√3·U·I₀6,2354 кВАр", "Заданная Qc6,235 кВАр", "СтатусQc в пределах"], "boundary");
await calculate("kompensaciya-dvigatelya.html", { qc: "6,236" }, ["Предел Qc ≤ 0,9·√3·U·I₀6,235 кВАр", "Заданная Qc6,236 кВАр", "СтатусQc больше предела"], "boundary");
// Подбор до 0,95: 16,67·(0,6197 − 0,3287) = 4,851 кВАр ≤ предела.
await calculateWithout("kompensaciya-dvigatelya.html", { mode: "pick" }, ["Нужно для cos φ = 0,954,851 кВАр", "Принять Qc4,851 кВАр", "cos φ после компенсации при номинальной нагрузке0,95", "СтатусQc в пределах"], ["ограничено"]);
// Подбор до 0,99: нужно 16,67·(0,6197 − 0,1425) = 7,954 > 6,235 → ограничено, cos φ₂ = 0,9711.
await calculate("kompensaciya-dvigatelya.html", { mode: "pick", ct: "0,99" }, ["Нужно для cos φ = 0,997,954 кВАр", "Принять Qc6,235 кВАр — ограничено пределом", "cos φ после компенсации при номинальной нагрузке0,9711", "cos φ₁/cos φ₂0,8753", "СтатусЦелевой cos φ у зажимов недостижим"]);
// Перекомпенсация: I₀ = 25 А → предел 15,59; Qc = 12 > Q₁ = 10,33 → Q₂ = −1,671, cos φ₂ = 0,995 опережающий.
await calculate("kompensaciya-dvigatelya.html", { i0: "25", qc: "12" }, ["Предел Qc ≤ 0,9·√3·U·I₀15,59 кВАр", "cos φ после компенсации при номинальной нагрузке0,995 (опережающий — перекомпенсация)", "cos φ₁/cos φ₂0,8543", "СтатусQc в пределах"]);
await invalid("kompensaciya-dvigatelya.html", { i0: "30" }, "Ток холостого хода должен быть меньше номинального тока двигателя: по введённым P, η, cos φ и U он равен 28,3 А");
await invalid("kompensaciya-dvigatelya.html", { p: "x" }, "Заполните мощность, КПД, cos φ");
await invalid("kompensaciya-dvigatelya.html", { c1: "1" }, "cos φ двигателя задаётся в долях");
await invalid("kompensaciya-dvigatelya.html", { eta: "1,2" }, "КПД задаётся в долях");
await invalid("kompensaciya-dvigatelya.html", { mode: "pick", ct: "0,8" }, "Целевой cos φ должен быть больше исходного");
await invalid("kompensaciya-dvigatelya.html", { qc: "abc" }, "Введите мощность конденсаторов");
await invalid("kompensaciya-dvigatelya.html", { u: "6000" }, "до 1000 В");

// --- skolzhenie-dvigatelya: n₀ = 60·f/p, s = (n₀ − n)/n₀, f₂ = s·f, M = P/ω ---
// Эталон 1: 50 Гц, 1450 об/мин → 3000/1450 = 2,07 → p = 2, n₀ = 1500; s = 50/1500 = 3,333 %; f₂ = 1,667 Гц;
// M = 15000/(2π·1450/60) = 98,79 Н·м.
await calculate("skolzhenie-dvigatelya.html", {}, ["Число пар полюсов p (определено по скорости)2", "Число полюсов 2p4", "Синхронная скорость n₀ = 60·f/p1500 об/мин", "Скольжение s = (n₀ − n)/n₀3,333 %", "Частота тока ротора f₂ = s·f1,667 Гц", "Номинальный момент M = P/ω98,79 Н·м"]);
// Эталон 2: p = 3 вручную, 960 об/мин: n₀ = 1000, s = 4 %, f₂ = 2 Гц, M = 7500/(2π·16) = 74,6 Н·м.
await calculateWithout("skolzhenie-dvigatelya.html", { mode: "man", p: "3", n: "960", pw: "7,5" }, ["Число пар полюсов p3", "1000 об/мин", "Скольжение s = (n₀ − n)/n₀4 %", "Частота тока ротора f₂ = s·f2 Гц", "Номинальный момент M = P/ω74,6 Н·м"], ["определено по скорости"]);
// 60 Гц, 1750: 3600/1750 = 2,06 → p = 2, n₀ = 1800, s = 2,778 %, M = 15000/(2π·1750/60) = 81,85.
await calculate("skolzhenie-dvigatelya.html", { f: "60", n: "1750" }, ["1800 об/мин", "Скольжение s = (n₀ − n)/n₀2,778 %", "Номинальный момент M = P/ω81,85 Н·м"]);
await calculate("skolzhenie-dvigatelya.html", { n: "2900", pw: "3" }, ["Число пар полюсов p (определено по скорости)1", "3000 об/мин", "3,333 %", "Номинальный момент M = P/ω9,879 Н·м"]);
// Режим вручную влияет на расчёт: p = 1 при 1450 → s = 1550/3000 = 51,67 %.
await calculate("skolzhenie-dvigatelya.html", { mode: "man", p: "1" }, ["Число пар полюсов p1", "3000 об/мин", "Скольжение s = (n₀ − n)/n₀51,67 %"]);
await calculate("skolzhenie-dvigatelya.html", { mode: "man", p: "2", n: "1499,9", pw: "1" }, ["Скольжение s = (n₀ − n)/n₀0,006667 %", "Частота тока ротора f₂ = s·f0,003333 Гц", "Номинальный момент M = P/ω6,367 Н·м"], "boundary");
await invalid("skolzhenie-dvigatelya.html", { mode: "man", p: "2", n: "1500" }, "не меньше синхронной n₀ = 1500 об/мин");
await invalid("skolzhenie-dvigatelya.html", { n: "1500" }, "равна синхронной при p = 2");
await invalid("skolzhenie-dvigatelya.html", { n: "3100" }, "выше синхронной даже при одной паре полюсов");
await invalid("skolzhenie-dvigatelya.html", { mode: "man", p: "2,5" }, "целое число от 1");
await invalid("skolzhenie-dvigatelya.html", { n: "abc" }, "Заполните частоту сети");
await invalid("skolzhenie-dvigatelya.html", { f: "500" }, "400 Гц");

// Структурные проверки партии №3: запрещённые формы статуса, видимость
// полей по режиму, ссылки на существующие страницы вместо дублирования,
// входящие ссылки на новые страницы из существующих.
{
  kind = "structural";
  const batch3 = ["avtomat-dlya-dvigatelya", "avtotransformatornyy-pusk", "ustavka-teplovogo-rele", "kompensaciya-dvigatelya", "skolzhenie-dvigatelya"];
  const visible = file => fs.readFileSync(path.join(sourceDir, file), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const slug of batch3) {
    const html = fs.readFileSync(path.join(sourceDir, `${slug}.html`), "utf8");
    check(!/проходит|безопасн|соответствует норм/i.test(visible(`${slug}.html`)) && !/проходит|безопасн|соответствует норм/i.test(html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1] ?? ""),
      `${slug}: запрещённые слова «проходит», «безопасно», «соответствует нормам»`);
    check(/обращение 30\.09\.2026/.test(html), `${slug}: в карточке источника нет даты обращения`);
  }
  const registry = fs.readFileSync(path.join(sourceDir, "ENGINEERING_AUDIT.md"), "utf8");
  const expectedStatus = { "avtomat-dlya-dvigatelya": "Оценка, не нормативный вердикт", "avtotransformatornyy-pusk": "Оценка, не нормативный вердикт",
    "ustavka-teplovogo-rele": "Оценка, не нормативный вердикт", "kompensaciya-dvigatelya": "Сверено с источником и тестами", "skolzhenie-dvigatelya": "Оценка, не нормативный вердикт" };
  for (const [slug, label] of Object.entries(expectedStatus)) {
    const card = fs.readFileSync(path.join(sourceDir, `${slug}.html`), "utf8").match(/<section class="src">([\s\S]*?)<\/section>/)?.[1] ?? "";
    check(card.includes(label) && card.includes("Границы применимости") && !/Проверил:/.test(card),
      `${slug}: карточка источника — ожидался статус «${label}», границы применимости и никакого выдуманного проверяющего`);
    check(registry.includes(`\`${slug}\``), `ENGINEERING_AUDIT.md: нет записи о ${slug}`);
  }
  check(/href="zona-srabatyvaniya-avtomata\.html"/.test(fs.readFileSync(path.join(sourceDir, "avtomat-dlya-dvigatelya.html"), "utf8")),
    "avtomat-dlya-dvigatelya: нет ссылки на страницу зоны срабатывания B/C/D");
  check(/href="power-factor-compensation\.html"/.test(fs.readFileSync(path.join(sourceDir, "kompensaciya-dvigatelya.html"), "utf8")),
    "kompensaciya-dvigatelya: нет ссылки на общую страницу компенсации");
  const inbound = { "zona-srabatyvaniya-avtomata": "avtomat-dlya-dvigatelya", "prosadka-pri-puske": "avtotransformatornyy-pusk",
    "zvezda-treugolnik": "ustavka-teplovogo-rele", "power-factor-compensation": "kompensaciya-dvigatelya", "kondensator-dvigatelya": "skolzhenie-dvigatelya" };
  for (const [from, to] of Object.entries(inbound)) {
    const block = fs.readFileSync(path.join(sourceDir, `${from}.html`), "utf8").match(/<section class="related">([\s\S]*?)<\/section>/)?.[1] ?? "";
    check(block.includes(`href="${to}.html"`), `${from}: в «Смотрите также» нет ссылки на ${to}`);
  }
  const shown = async (file, sel, value, id) => {
    const dom = await load(file); const d = dom.window.document;
    const el = d.getElementById(sel); el.value = value; el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const vis = d.getElementById(`f_${id}`).style.display !== "none"; dom.window.close(); return vis;
  };
  check(!(await shown("avtotransformatornyy-pusk.html", "met", "at65", "k")) && await shown("avtotransformatornyy-pusk.html", "met", "atk", "k"),
    "avtotransformatornyy-pusk: поле k должно быть видно только для своего отвода");
  check(!(await shown("ustavka-teplovogo-rele.html", "base", "iec", "sf")) && await shown("ustavka-teplovogo-rele.html", "base", "nec", "sf"),
    "ustavka-teplovogo-rele: коэффициент сервиса влияет только в режиме NEC и должен быть скрыт иначе");
  check(!(await shown("kompensaciya-dvigatelya.html", "mode", "pick", "qc")) && await shown("kompensaciya-dvigatelya.html", "mode", "pick", "ct"),
    "kompensaciya-dvigatelya: в режиме подбора поле Qc скрыто, целевой cos φ виден");
  check(await shown("kompensaciya-dvigatelya.html", "mode", "check", "qc") && !(await shown("kompensaciya-dvigatelya.html", "mode", "check", "ct")),
    "kompensaciya-dvigatelya: в режиме проверки поле Qc видно, целевой cos φ скрыт");
  check(!(await shown("skolzhenie-dvigatelya.html", "mode", "auto", "p")) && await shown("skolzhenie-dvigatelya.html", "mode", "man", "p"),
    "skolzhenie-dvigatelya: поле p видно только в ручном режиме");
}

// --- Партия №3: находки независимого проверяющего (эталоны посчитаны им отдельно) ---
// Все 261 ячейка таблиц IE2–IE4 (50 Гц, 2/4/6 полюсов) — по независимой выписке проверяющего
// из Регламента (ЕС) 2019/1781, прил. I, табл. 1–3, а не из data_m.py.
{
  const P = [0.12,0.18,0.2,0.25,0.37,0.4,0.55,0.75,1.1,1.5,2.2,3,4,5.5,7.5,11,15,18.5,22,30,37,45,55,75,90,110,132,160,200];
  const T = {"ie2": {"2": "53.6 60.4 61.9 64.8 69.5 70.4 74.1 77.4 79.6 81.3 83.2 84.6 85.8 87.0 88.1 89.4 90.3 90.9 91.3 92.0 92.5 92.9 93.2 93.8 94.1 94.3 94.6 94.8 95.0", "4": "59.1 64.7 65.9 68.5 72.7 73.5 77.1 79.6 81.4 82.8 84.3 85.5 86.6 87.7 88.7 89.8 90.6 91.2 91.6 92.3 92.7 93.1 93.5 94.0 94.2 94.5 94.7 94.9 95.1", "6": "50.6 56.6 58.2 61.6 67.6 68.8 73.1 75.9 78.1 79.8 81.8 83.3 84.6 86.0 87.2 88.7 89.7 90.4 90.9 91.7 92.2 92.7 93.1 93.7 94.0 94.3 94.6 94.8 95.0"}, "ie3": {"2": "60.8 65.9 67.2 69.7 73.8 74.6 77.8 80.7 82.7 84.2 85.9 87.1 88.1 89.2 90.1 91.2 91.9 92.4 92.7 93.3 93.7 94.0 94.3 94.7 95.0 95.2 95.4 95.6 95.8", "4": "64.8 69.9 71.1 73.5 77.3 78.0 80.8 82.5 84.1 85.3 86.7 87.7 88.6 89.6 90.4 91.4 92.1 92.6 93.0 93.6 93.9 94.2 94.6 95.0 95.2 95.4 95.6 95.8 96.0", "6": "57.7 63.9 65.4 68.6 73.5 74.4 77.2 78.9 81.0 82.5 84.3 85.6 86.8 88.0 89.1 90.3 91.2 91.7 92.2 92.9 93.3 93.7 94.1 94.6 94.9 95.1 95.4 95.6 95.8"}, "ie4": {"2": "66.5 70.8 71.9 74.3 78.1 78.9 81.5 83.5 85.2 86.5 88.0 89.1 90.0 90.9 91.7 92.6 93.3 93.7 94.0 94.5 94.8 95.0 95.3 95.6 95.8 96.0 96.2 96.3 96.5", "4": "69.8 74.7 75.8 77.9 81.1 81.7 83.9 85.7 87.2 88.2 89.5 90.4 91.1 91.9 92.6 93.3 93.9 94.2 94.5 94.9 95.2 95.4 95.7 96.0 96.1 96.3 96.4 96.6 96.7", "6": "64.9 70.1 71.4 74.1 78.0 78.7 80.9 82.7 84.5 85.9 87.4 88.6 89.5 90.5 91.3 92.3 92.9 93.4 93.7 94.2 94.5 94.8 95.1 95.4 95.6 95.8 96.0 96.2 96.3"}};
  const pct = x => String(Number(x)).replace(".", ",") + " %";
  for (const pol of ["2", "4", "6"]) for (let k = 0; k < P.length; k++) {
    const p = String(P[k]).replace(".", ",");
    const ie2 = T.ie2[pol].split(" ")[k], ie3 = T.ie3[pol].split(" ")[k], ie4 = T.ie4[pol].split(" ")[k];
    await calculate("kpd-dvigatelya-ie.html", { p, pol, cold: "ie2", cnew: "ie3" }, ["Минимальный КПД IE2" + pct(ie2), "Минимальный КПД IE3" + pct(ie3)]);
    await calculate("kpd-dvigatelya-ie.html", { p, pol, cold: "ie3", cnew: "ie4" }, ["Минимальный КПД IE4" + pct(ie4)]);
  }
}
// Напряжение у границы выхода ПЧ не округляется через неё.
await calculate("podbor-chastotnogo-preobrazovatelya.html", { um: "480,01" }, ["480,01 В — вне выхода ПЧ 380–480 В", "СтатусНедостаточно данных"], "boundary");
await calculate("podbor-chastotnogo-preobrazovatelya.html", { set: "1x240", um: "240,01", im: "8,5" }, ["240,01 В — вне выхода ПЧ 200–240 В"], "boundary");
await calculate("podbor-chastotnogo-preobrazovatelya.html", { load: "heavy", kp: "150,001", tp: "60" }, ["150,001 % на 60 с"], "boundary");
// Реле: требуемая уставка чуть выше диапазона показана точно, кратность и класс по недопустимой уставке не выводятся.
await calculateWithout("ustavka-teplovogo-rele.html", { im: "13,0004" }, ["Диапазон реле9…13 А", "требуемая уставка 13,0004 А вне диапазона"], ["Кратность пускового тока к уставке", "Наименьший класс"], "boundary");
// «Наименьший класс, гарантирующий пуск» на границах нижних времён классов 2 / 4 / 6 / 9 с.
for (const [tp, cls] of [["2", "10A"], ["2,01", "10"], ["4", "10"], ["4,01", "20"], ["6", "20"], ["6,01", "30"], ["9", "30"]])
  await calculate("ustavka-teplovogo-rele.html", { tp }, ["Наименьший класс, гарантирующий пуск" + cls + "Статус"], "boundary");
await calculate("ustavka-teplovogo-rele.html", { tp: "9,01" }, ["ни один из классов 10A–30"], "boundary");

// ===========================================================================
// --- Партия №4, data_o.py ---
// «Аккумуляторы и накопители»: пассивная балансировка ячеек Li-ion, ток
// разряда Li-ion сборки с требованиями к BMS и предохранителю,
// суперконденсатор для импульсной нагрузки, ток выравнивания двух АКБ.
// Ожидаемые значения посчитаны отдельным скриптом (scratchpad o/ref.py) с
// округлением как у toPrecision (половина — вверх), а не кодом страниц;
// расчёт — в комментариях. Для суперконденсатора при постоянной мощности
// время посчитано численной квадратурой t = (C/P)·∫u(v)dv по напряжению
// идеальной ёмкости, а не замкнутой формулой страницы.
// ===========================================================================

// --- 1. balansirovka-yacheek-bms: TI SLUAA81A, ADI, TI SLUAAR1 ---
// Эталон 1 (пример TI для BQ769x2): I = 4,2 / (2·20 + 25) = 64,62 мА; P = 4,2·0,06462 = 0,2714 Вт;
// в резисторах 0,06462²·40 = 0,167 Вт, в ключе ·25 = 0,1044 Вт (у TI «около 0,1 Вт»);
// ΔQ = 3 А·ч · 5 % = 150 мА·ч; t = 0,15 / 0,06462 = 2,321 ч; E = 4,2·0,15 = 0,63 Вт·ч = 2268 Дж.
await calculateWithout("balansirovka-yacheek-bms.html", {}, ["Ток балансировки I = U / (Rрез + Rключа)64,62 мА", "Мощность в цепи балансировки P = U·I0,2714 Вт", "Из неё в резисторах / в ключе (I²·R)0,167 / 0,1044 Вт", "Разбаланс по заряду ΔQ150 мА·ч (5 % SoC)", "Время выравнивания t = ΔQ / Iср2,321 ч", "Тепло в цепи балансировки E = U·ΔQ0,63 Вт·ч (2,268 кДж)", "СтатусОценка: разбаланс 150 мА·ч выравнивается примерно за 2,321 ч работы балансировки"], ["Средний ток", "Циклов", "Недостаточно данных"]);
// Эталон 2 (пример Battery Design): 30 мА, разница 8 А·ч → 8 / 0,03 = 266,7 ч = 11,11 сут; E = 3,6·8 = 28,8 Вт·ч = 103,7 кДж.
await calculateWithout("balansirovka-yacheek-bms.html", { dmode: "ah", dah: "8", dah_unit: "1", cap: "10", imode: "i", ib: "30", u: "3,6" }, ["Ток балансировки по паспорту BMS30 мА", "Мощность в цепи балансировки P = U·I0,108 Вт", "Разбаланс по заряду ΔQ8000 мА·ч (80 % SoC)", "Время выравнивания t = ΔQ / Iср266,7 ч (11,11 сут)", "Тепло в цепи балансировки E = U·ΔQ28,8 Вт·ч (103,7 кДж)"], ["Из неё в резисторах"]);
// Доля времени 50 %: Iср = 32,31 мА, t = 4,643 ч; по 1 ч за цикл — ⌈4,643⌉ = 5 циклов.
await calculate("balansirovka-yacheek-bms.html", { duty: "50", tcyc: "1" }, ["Средний ток при доле времени 50 %32,31 мА", "Время выравнивания t = ΔQ / Iср4,643 ч", "Циклов заряда при 1 ч балансировки за циклне меньше 5", "BQ769x2 на время измерения"]);
// По напряжению для NMC с наклоном из паспорта: 12 мВ / 8 мВ/% = 1,5 % → 45 мА·ч; t = 0,045 / 0,06462 = 0,6964 ч = 41,79 мин;
// E = 4,2·0,045 = 0,189 Вт·ч = 680,4 Дж.
await calculate("balansirovka-yacheek-bms.html", { dmode: "volt", chem: "nmc", du: "12", slope: "8" }, ["Разбаланс по наклону кривой OCV: ΔSoC = ΔU / k1,5 %", "Разбаланс по заряду ΔQ45 мА·ч", "Время выравнивания t = ΔQ / Iср41,79 мин", "Тепло в цепи балансировки E = U·ΔQ0,189 Вт·ч (680,4 Дж)", "СтатусОценка: разбаланс 45 мА·ч выравнивается примерно за 41,79 мин работы балансировки (по наклону кривой OCV из паспорта)", "в покое, после отдыха без тока"]);
// Рискованный вывод: разница напряжений LiFePO₄ в разбаланс не пересчитывается — даже если в скрытом поле остался наклон.
await calculateWithout("balansirovka-yacheek-bms.html", { dmode: "volt", chem: "lfp", du: "12" }, ["Ток балансировки I = U / (Rрез + Rключа)64,62 мА", "СтатусНедостаточно данных: у LiFePO₄ напряжение покоя почти не меняется на большей части диапазона SoC", "10–85 % SoC"], ["Время выравнивания", "Разбаланс по заряду", "Оценка"]);
await calculateWithout("balansirovka-yacheek-bms.html", { dmode: "volt", chem: "lfp", du: "12", slope: "8" }, ["СтатусНедостаточно данных: у LiFePO₄"], ["Время выравнивания", "Оценка"]);
await calculateWithout("balansirovka-yacheek-bms.html", { dmode: "volt", chem: "nmc", du: "12", slope: "" }, ["СтатусНедостаточно данных: чтобы пересчитать разницу напряжений в разбаланс заряда, нужен наклон кривой OCV–SoC из паспорта этой ячейки"], ["Время выравнивания", "Оценка"]);
// Границы: разбаланс, равный ёмкости, и 100 % SoC допустимы (3 / 0,06462 = 46,43 ч), больше — ошибка.
await calculate("balansirovka-yacheek-bms.html", { dmode: "ah", dah: "3000" }, ["Разбаланс по заряду ΔQ3000 мА·ч (100 % SoC)", "46,43 ч"], "boundary");
await calculate("balansirovka-yacheek-bms.html", { dsoc: "100" }, ["Разбаланс по заряду ΔQ3000 мА·ч (100 % SoC)", "46,43 ч"], "boundary");
await calculate("balansirovka-yacheek-bms.html", { dmode: "volt", chem: "nmc", du: "200", slope: "2" }, ["ΔSoC = ΔU / k100 %", "46,43 ч"], "boundary");
// Переход единиц времени: 100 мА·ч при 100 мА — ровно 1 ч; 99,9 — 59,94 мин; 48 ч — уже с сутками, 47,9 ч — без.
await calculate("balansirovka-yacheek-bms.html", { dmode: "ah", dah: "100", imode: "i", ib: "100" }, ["Время выравнивания t = ΔQ / Iср1 ч"], "boundary");
await calculate("balansirovka-yacheek-bms.html", { dmode: "ah", dah: "99,9", imode: "i", ib: "100" }, ["Время выравнивания t = ΔQ / Iср59,94 мин"], "boundary");
await calculate("balansirovka-yacheek-bms.html", { dmode: "ah", dah: "4800", cap: "10", imode: "i", ib: "100" }, ["Время выравнивания t = ΔQ / Iср48 ч (2 сут)"], "boundary");
await calculateWithout("balansirovka-yacheek-bms.html", { dmode: "ah", dah: "4790", cap: "10", imode: "i", ib: "100" }, ["Время выравнивания t = ΔQ / Iср47,9 ч"], ["сут"], "boundary");
// Циклы: ровно 2 ч при 1 ч за цикл — 2 цикла; 2,001 ч — уже 3.
await calculate("balansirovka-yacheek-bms.html", { dmode: "ah", dah: "200", imode: "i", ib: "100", tcyc: "1" }, ["Циклов заряда при 1 ч балансировки за циклне меньше 2"], "boundary");
await calculate("balansirovka-yacheek-bms.html", { dmode: "ah", dah: "200,1", imode: "i", ib: "100", tcyc: "1" }, ["Циклов заряда при 1 ч балансировки за циклне меньше 3"], "boundary");
// Доля 99,99 % уже влияет на расчёт: 64,61 мА и 2,322 ч.
await calculate("balansirovka-yacheek-bms.html", { duty: "99,99" }, ["Средний ток при доле времени 99,99 %64,61 мА", "2,322 ч"], "boundary");
await invalid("balansirovka-yacheek-bms.html", { dmode: "ah", dah: "3000,1" }, "не может быть больше ёмкости ячейки");
await invalid("balansirovka-yacheek-bms.html", { dsoc: "100,01" }, "Разбаланс по SoC — больше 0 и не больше 100 %");
await invalid("balansirovka-yacheek-bms.html", { dmode: "volt", chem: "nmc", du: "500", slope: "2" }, "больше 100 % SoC");
await invalid("balansirovka-yacheek-bms.html", { cap: "3 А·ч" }, "Введите ёмкость ячейки");
await invalid("balansirovka-yacheek-bms.html", { u: "0" }, "Напряжение ячейки при балансировке");
await invalid("balansirovka-yacheek-bms.html", { u: "5,01" }, "Напряжение ячейки при балансировке");
await invalid("balansirovka-yacheek-bms.html", { duty: "0" }, "Доля времени балансировки");
await invalid("balansirovka-yacheek-bms.html", { rb: "-1" }, "Сопротивления не могут быть отрицательными");
await invalid("balansirovka-yacheek-bms.html", { rb: "0", rsw: "0" }, "Сопротивление цепи балансировки должно быть больше нуля");
await invalid("balansirovka-yacheek-bms.html", { imode: "i", ib: "0" }, "Ток балансировки должен быть больше нуля");
await invalid("balansirovka-yacheek-bms.html", { imode: "i", ib: "abc" }, "Введите ток балансировки");
await invalid("balansirovka-yacheek-bms.html", { dmode: "volt", chem: "nmc", slope: "abc" }, "Наклон кривой OCV–SoC — число");
await invalid("balansirovka-yacheek-bms.html", { dmode: "volt", chem: "nmc", du: "0", slope: "8" }, "Разница напряжений должна быть больше нуля");
await invalid("balansirovka-yacheek-bms.html", { tcyc: "0" }, "Время балансировки за цикл должно быть больше нуля");
await invalid("balansirovka-yacheek-bms.html", { tcyc: "час" }, "Время балансировки за цикл — число");

// --- 2. tok-razryada-liion-sborki: паспорт ячейки, Orion BMS, Littelfuse ---
// Эталон 1 (пример на странице, Samsung INR18650-25R): 13S4P, 20 А · 4 = 80 А; 1000 Вт / (13·2,5 В) = 30,77 А (3,077C,
// 7,692 А на ячейку); пик 2000 Вт → 61,54 А ≤ 80 А; предохранитель: 13·4,2 = 54,6 В, 30,77 / 0,75 = 41,03 А,
// ток КЗ 4·4,2 / 0,018 = 933,3 А (то же, что 13·4,2 / (13·0,018/4)).
await calculate("tok-razryada-liion-sborki.html", {}, ["Сборка13S4P: всего ячеек — 52, ёмкость 10 А·ч", "Напряжение сборки: заряжена / наименьшее под нагрузкой54,6 / 32,5 В", "Допустимый длительный ток сборки Iячейки · P80 А", "Импульсный токв паспорте не задан — пики сравниваются с длительным током", "Ток нагрузки при наименьшем напряжении P / (η·S·Umin)30,77 А — 3,077C, по 7,692 А на ячейку при равном делении", "Пиковый ток нагрузки61,54 А в течение 10 с", "BMS должна пропускать без отключенияне меньше 30,77 А длительно и 61,54 А в течение 10 с", "Предел тока разряда в настройке BMSне выше 80 А длительно — по паспорту ячеек", "Предохранитель: номинальное напряжение постоянного токане меньше 54,6 В", "Предохранитель: номинальный токне меньше 41,03 А по правилу Littelfuse для его предохранителей", "не меньше ожидаемого тока КЗ ≈ 933,3 А", "СтатусОценка: длительный ток нагрузки 30,77 А не больше допустимого 80 А; пик 61,54 А — в пределах длительного тока 80 А"]);
// Эталон 2 (режим C-rate и импульс): 16S1P, 100 А·ч, 1C → 100 А, 2C → 200 А на 10 с; нагрузка 60 А, пик 150 А на 5 с;
// 16·3,65 = 58,4 В, 16·2,5 = 40 В; 60 / 0,75 = 80 А; ток КЗ 1·3,65 / 0,00025 = 14 600 А.
await calculate("tok-razryada-liion-sborki.html", { s: "16", p: "1", cap: "100", umax: "3,65", umin: "2,5", spec: "c", crc: "1", crp: "2", tpk: "10", lmode: "i", il: "60", ipk: "150", tl: "5", rcell: "0,25" }, ["Сборка16S1P: всего ячеек — 16, ёмкость 100 А·ч", "58,4 / 40 В", "Допустимый длительный ток сборки C-rate · C · P100 А", "Допустимый импульсный ток сборки200 А не дольше 10 с", "Ток нагрузки60 А — 0,6C, по 60 А на ячейку при равном делении", "Пиковый ток нагрузки150 А в течение 5 с", "не выше 100 А длительно и 200 А не дольше 10 с", "не меньше 80 А по правилу Littelfuse", "≈ 14600 А", "СтатусОценка: длительный ток нагрузки 60 А не больше допустимого 100 А; пик 150 А — в пределах импульсного тока 200 А"]);
// Превышение: 3000 Вт / 32,5 В = 92,31 А > 80 А — категоричный вывод по паспорту, без «Оценки».
await calculateWithout("tok-razryada-liion-sborki.html", { pl: "3000", ppk: "", tl: "" }, ["Ток нагрузки при наименьшем напряжении P / (η·S·Umin)92,31 А", "не меньше 123,1 А по правилу Littelfuse", "СтатусТок нагрузки 92,31 А больше допустимого длительного тока сборки 80 А по паспорту ячейки"], ["Оценка", "Пиковый ток нагрузки"]);
// КПД 90 %: 1000 / (0,9·32,5) = 34,19 А (3,419C, 8,547 А на ячейку), пик 68,38 А, предохранитель от 45,58 А.
await calculate("tok-razryada-liion-sborki.html", { eta: "90" }, ["34,19 А — 3,419C, по 8,547 А на ячейку", "Пиковый ток нагрузки68,38 А", "не меньше 45,58 А"]);
// Импульс по паспорту 35 А на 5 с → 140 А; пик 4000 Вт = 123,1 А ровно 5 с — в пределах импульсного тока.
await calculate("tok-razryada-liion-sborki.html", { ipa: "35", tpk: "5", ppk: "4000", tl: "5" }, ["Допустимый импульсный ток сборки140 А не дольше 5 с", "Пиковый ток нагрузки123,1 А в течение 5 с", "Предел тока разряда в настройке BMSне выше 80 А длительно и 140 А не дольше 5 с", "СтатусОценка: длительный ток нагрузки 30,77 А не больше допустимого 80 А; пик 123,1 А — в пределах импульсного тока 140 А"], "boundary");
// Тот же пик на 5,01 с — дольше паспортного импульса и больше длительного тока: паспорт такой режим не допускает.
await calculateWithout("tok-razryada-liion-sborki.html", { ipa: "35", tpk: "5", ppk: "4000", tl: "5,01" }, ["СтатусПик 123,1 А длится дольше паспортного импульса (5,01 с против 5 с) и больше длительного тока 80 А — паспорт ячейки такой режим не допускает"], ["Оценка"], "boundary");
// 5000 Вт → 153,8 А > 140 А импульсного тока.
await calculateWithout("tok-razryada-liion-sborki.html", { ipa: "35", tpk: "5", ppk: "5000", tl: "5" }, ["СтатусПиковый ток нагрузки 153,8 А больше допустимого импульсного тока сборки 140 А по паспорту ячейки"], ["Оценка"]);
// Граница импульсного тока: 4550 Вт / 32,5 В = 140 А — в пределах; 4550,1 Вт = 140,003 А — показан по ту же сторону от 140 А.
await calculate("tok-razryada-liion-sborki.html", { ipa: "35", tpk: "5", ppk: "4550", tl: "5" }, ["пик 140 А — в пределах импульсного тока 140 А"], "boundary");
await calculateWithout("tok-razryada-liion-sborki.html", { ipa: "35", tpk: "5", ppk: "4550,1", tl: "5" }, ["СтатусПиковый ток нагрузки 140,003 А больше допустимого импульсного тока сборки 140 А"], ["Оценка"], "boundary");
// Импульсный ток в паспорте не задан, пик 3000 Вт = 92,31 А больше длительного: «Недостаточно данных», не «Оценка».
await calculateWithout("tok-razryada-liion-sborki.html", { ppk: "3000" }, ["СтатусНедостаточно данных: пиковый ток 92,31 А больше длительного тока сборки 80 А, а импульсный ток в паспорте не задан", "только если его задаёт производитель ячейки (Orion BMS)"], ["Оценка"]);
await calculate("tok-razryada-liion-sborki.html", { ppk: "2600" }, ["пик 80 А — в пределах длительного тока 80 А"], "boundary");
// Вне паспортного диапазона температур вывода нет.
await calculateWithout("tok-razryada-liion-sborki.html", { temp: "no" }, ["СтатусНедостаточно данных: паспортный ток разряда задан для своего диапазона температур ячейки"], ["Оценка", "СтатусТок нагрузки", "СтатусПик"]);
// Нагрузка током: ровно 80 А — в пределах, 80,001 А — больше (показано 80,001, а не 80).
await calculate("tok-razryada-liion-sborki.html", { lmode: "i", il: "80", ipk: "", tl: "" }, ["Ток нагрузки80 А — 8C, по 20 А на ячейку при равном делении", "СтатусОценка: длительный ток нагрузки 80 А не больше допустимого 80 А"], "boundary");
await calculateWithout("tok-razryada-liion-sborki.html", { lmode: "i", il: "80,001", ipk: "", tl: "" }, ["СтатусТок нагрузки 80,001 А больше допустимого длительного тока сборки 80 А"], ["Оценка"], "boundary");
// Режим «нагрузка током» со значениями по умолчанию: 30 А = 3C (7,5 А на ячейку), пик 60 А ≤ 80 А; 30 / 0,75 = 40 А.
await calculate("tok-razryada-liion-sborki.html", { lmode: "i" }, ["Ток нагрузки30 А — 3C, по 7,5 А на ячейку при равном делении", "Пиковый ток нагрузки60 А в течение 10 с", "не меньше 40 А по правилу Littelfuse", "СтатусОценка: длительный ток нагрузки 30 А не больше допустимого 80 А; пик 60 А — в пределах длительного тока 80 А"]);
await calculateWithout("tok-razryada-liion-sborki.html", { rcell: "" }, ["отключающая способность при постоянном токене оценена — нужен ожидаемый ток КЗ сборки"], ["≈"]);
await invalid("tok-razryada-liion-sborki.html", { s: "2,5" }, "целые числа от 1 до 1000");
await invalid("tok-razryada-liion-sborki.html", { p: "0" }, "целые числа от 1 до 1000");
await invalid("tok-razryada-liion-sborki.html", { cap: "0" }, "Ёмкость ячейки должна быть больше нуля");
await invalid("tok-razryada-liion-sborki.html", { umax: "5,1" }, "не больше 5 В");
await invalid("tok-razryada-liion-sborki.html", { umin: "4,3" }, "больше наименьшего напряжения под нагрузкой");
await invalid("tok-razryada-liion-sborki.html", { ica: "abc" }, "Введите длительный ток разряда ячейки");
await invalid("tok-razryada-liion-sborki.html", { ipa: "15", tpk: "5" }, "Импульсный ток должен быть больше длительного");
await invalid("tok-razryada-liion-sborki.html", { ipa: "30" }, "Для импульсного тока задайте его длительность");
await invalid("tok-razryada-liion-sborki.html", { tpk: "5" }, "Длительность импульса задана без импульсного тока");
await invalid("tok-razryada-liion-sborki.html", { spec: "c", crc: "0" }, "C-rate разряда должен быть больше нуля");
await invalid("tok-razryada-liion-sborki.html", { eta: "0" }, "КПД задаётся в процентах");
await invalid("tok-razryada-liion-sborki.html", { ppk: "900" }, "Пиковая мощность должна быть больше длительной");
await invalid("tok-razryada-liion-sborki.html", { tl: "" }, "Для пика нагрузки задайте его длительность");
await invalid("tok-razryada-liion-sborki.html", { rcell: "abc" }, "Внутреннее сопротивление — число");
await invalid("tok-razryada-liion-sborki.html", { lmode: "i", il: "x" }, "Введите длительный ток нагрузки");

// --- 3. raschet-superkondensatora: Eaton, ADI RAQ 179, Maxwell ---
// Эталон 1 (пример на странице): 100 Вт / 0,9 = 111,1 Вт; n = ⌈16 / 2,7⌉ = 6; ячейка к концу срока 350·0,8 = 280 Ф,
// 3,2·2 = 6,4 мОм. m = 1: 46,67 Ф и 38,4 мОм — квадратура даёт 37,30 с < 60; m = 2: 93,33 Ф, 19,2 мОм — 77,61 с.
// Без ESR 2·111,1·60 / (256 − 64) = 69,44 Ф; с ESR 93,33·60 / 77,61 = 72,15 Ф; u1 = 15,87 В → ток 7,003 А, в конце 111,1 / 8 = 13,89 А;
// просадка 0,1345 и 0,2667 В; энергия ½·116,7·192 = 11,2 кДж; без балансировки 16 / (1 + 5/1,2) = 3,097 В;
// резистор Eaton 2,667 / (50·0,75 мА) = 71,11 Ом, 37,5 мА, 0,1 Вт, R·C = 71,11·350 = 24 889 с = 6,91 ч.
await calculate("raschet-superkondensatora.html", {}, ["Последовательно элементов n = ⌈V1 / Uном⌉6 — по 2,667 В на элемент", "Параллельных цепочек m / всего элементов2 / 12", "Ёмкость банка: номинальная / с допуском и к концу срока116,7 / 93,33 Ф", "ESR банка: по паспорту / к концу срока9,6 / 19,2 мОм", "Нужная ёмкость без ESR 2·P·t / (η·(V1² − V2²))69,44 Ф", "Нужная ёмкость с ESR банка к концу срока72,15 Ф", "Банк к концу срока удерживает нагрузку77,61 с — нужно 60 с", "Ток банка в начале / в конце разряда7,003 / 13,89 А", "Просадка на ESR в начале / в конце0,1345 / 0,2667 В", "Энергия банка между V1 и V2 при номинальной ёмкости11,2 кДж", "Без балансировки после заряда с нуля элемент может получить3,097 В при номинале 2,7 В", "Пассивная балансировка по Eaton: резистор на элементне больше 71,11 Ом — 37,5 мА, 0,1 Вт; саморазряд R·C ≈ 6,91 ч", "СтатусОценка: банк 6 последовательно × 2 параллельно, всего элементов — 12; к концу срока удерживает нагрузку 77,61 с; нужна балансировка напряжений элементов"]);
// Эталон 2 (постоянный ток, счёт вручную): n = ⌈5 / 2,7⌉ = 2; ячейка 10·0,8 = 8 Ф, 75 мОм; C = 4m, R = 0,15/m;
// t = 4m·(2,5 − 5·0,15/m) / 5 = 2m − 0,6 → m = 5 даёт 9,4 с, m = 6 — 11,4 с; I·t/(V1 − V2) = 20 Ф; 50 / (2,5 − 0,125) = 21,05 Ф;
// просадка 5·0,025 = 0,125 В; энергия ½·30·(25 − 6,25) = 281,3 Дж; без балансировки 5 / (1 + 0,8/1,2) = 3 В.
await calculateWithout("raschet-superkondensatora.html", { mode: "i", il: "5", t: "10", v1: "5", v2: "2,5", cc: "10", tolm: "20", tolp: "20", esr: "75", ur: "2,7", eolc: "0", eolr: "0", ilk: "" }, ["2 — по 2,5 В на элемент", "Параллельных цепочек m / всего элементов6 / 12", "30 / 24 Ф", "25 / 25 мОм", "Нужная ёмкость без ESR I·t / (V1 − V2)20 Ф", "Нужная ёмкость с ESR банка к концу срока21,05 Ф", "Банк к концу срока удерживает нагрузку11,4 с — нужно 10 с", "Просадка на ESR I·R0,125 В", "281,3 Дж", "3 В при номинале 2,7 В", "без балансировки напряжение элемента может превысить номинальное"], ["Пассивная балансировка по Eaton", "Ток банка в начале"]);
// Пример Eaton: два 10 Ф ±20 % последовательно на 5 В — 5·1,2 / (1,2 + 0,8) = 3,0 В на одном.
await calculate("raschet-superkondensatora.html", { mode: "i", il: "1", t: "1", v1: "5", v2: "2,5", cc: "10", tolm: "20", tolp: "20", esr: "0", ur: "2,5", eolc: "0", eolr: "0", ilk: "" }, ["Без балансировки после заряда с нуля элемент может получить3 В при номинале 2,5 В", "может превысить номинальное"]);
// m = 1 при 37 с: квадратура 37,30 с; ток 7,064 / 13,89 А, просадка 0,2713 / 0,5333 В; C с ESR 46,67·37 / 37,30 = 46,29 Ф.
await calculate("raschet-superkondensatora.html", { t: "37" }, ["Параллельных цепочек m / всего элементов1 / 6", "58,33 / 46,67 Ф", "Нужная ёмкость с ESR банка к концу срока46,29 Ф", "Банк к концу срока удерживает нагрузку37,3 с — нужно 37 с", "7,064 / 13,89 А", "0,2713 / 0,5333 В", "5,6 кДж"]);
// Граница выбора m: 37,30107 с ≥ 37,3 — одна цепочка (время показано 37,301, а не 37,3); 37,31 — уже две.
await calculate("raschet-superkondensatora.html", { t: "37,3" }, ["Параллельных цепочек m / всего элементов1 / 6", "Банк к концу срока удерживает нагрузку37,301 с — нужно 37,3 с"], "boundary");
await calculate("raschet-superkondensatora.html", { t: "37,31" }, ["Параллельных цепочек m / всего элементов2 / 12"], "boundary");
// Один элемент — балансировка не нужна: 10 Вт, 2,7 → 1 В: квадратура 75,69 с, ток 4,156 / 11,11 А.
await calculateWithout("raschet-superkondensatora.html", { pw: "10", t: "10", v1: "2,7", v2: "1" }, ["1 — по 2,7 В на элемент", "1 / 1", "Банк к концу срока удерживает нагрузку75,69 с — нужно 10 с", "Ток банка в начале / в конце разряда4,156 / 11,11 А"], ["балансировк"]);
// Обрыв раньше V2: 5000 Вт, V2 = 1 В. m = 10: 466,7 Ф, 3,84 мОм; √(5555,6·0,00384) = 4,619 В > 1 В — предел на выводах;
// квадратура до обрыва 5,919 с (m = 9 — 4,949 с); ток 382,3 / 1203 А; C с ESR 466,7·5 / 5,919 = 394,2 Ф.
await calculate("raschet-superkondensatora.html", { pw: "5000", t: "5", v2: "1" }, ["Параллельных цепочек m / всего элементов10 / 60", "583,3 / 466,7 Ф", "1,92 / 3,84 мОм", "217,9 Ф", "Нужная ёмкость с ESR банка к концу срока394,2 Ф", "Банк к концу срока удерживает нагрузку5,919 с — нужно 5 с", "382,3 / 1203 А", "1,468 / 4,619 В", "74,38 кДж", "предел на выводах — √(P·R/η) = 4,619 В: выведено из наименьшего напряжения стека √(4·R·P/η) у ADI"]);
// Число элементов на границе номинала: 16,2 В = 6·2,7 — шесть; 16,21 В — семь (по 2,316 В).
await calculate("raschet-superkondensatora.html", { v1: "16,2" }, ["6 — по 2,7 В на элемент"], "boundary");
await calculate("raschet-superkondensatora.html", { v1: "16,21" }, ["7 — по 2,316 В на элемент"], "boundary");
// 13,8 / 2,3 в двоичной арифметике даёт 6,000000000000001 (у 16,2 / 2,7 — 5,999…9): без допуска округления
// вышло бы 7 элементов. 2,3 В — сниженное напряжение ячейки Maxwell для 85 °C. 13,81 / 7 = 1,973 В.
await calculate("raschet-superkondensatora.html", { v1: "13,8", ur: "2,3" }, ["6 — по 2,3 В на элемент"], "boundary");
await calculate("raschet-superkondensatora.html", { v1: "13,81", ur: "2,3" }, ["7 — по 1,973 В на элемент"], "boundary");
// Деление напряжения у порога: без допуска 2,5 В = номиналу; допуск +0,01 % даёт 2,500125 — показано 2,5001, а не 2,5.
await calculateWithout("raschet-superkondensatora.html", { mode: "i", il: "1", t: "1", v1: "5", v2: "2,5", cc: "10", tolm: "0", tolp: "0", esr: "0", ur: "2,5", eolc: "0", eolr: "0", ilk: "" }, ["2,5 В при номинале 2,5 В"], ["может превысить"], "boundary");
await calculate("raschet-superkondensatora.html", { mode: "i", il: "1", t: "1", v1: "5", v2: "2,5", cc: "10", tolm: "0", tolp: "0,01", esr: "0", ur: "2,5", eolc: "0", eolr: "0", ilk: "" }, ["2,5001 В при номинале 2,5 В", "может превысить номинальное"], "boundary");
await invalid("raschet-superkondensatora.html", { pw: "сто" }, "Введите мощность нагрузки");
await invalid("raschet-superkondensatora.html", { eta: "0" }, "КПД задаётся в процентах");
await invalid("raschet-superkondensatora.html", { mode: "i", il: "0" }, "Ток нагрузки должен быть больше нуля");
await invalid("raschet-superkondensatora.html", { t: "0" }, "Длительность должна быть больше нуля");
await invalid("raschet-superkondensatora.html", { v2: "16" }, "Нужно 0 < наименьшее напряжение");
await invalid("raschet-superkondensatora.html", { v2: "0" }, "Нужно 0 < наименьшее напряжение");
await invalid("raschet-superkondensatora.html", { cc: "0" }, "Ёмкость и номинальное напряжение элемента");
await invalid("raschet-superkondensatora.html", { tolm: "100" }, "Допуск ёмкости");
await invalid("raschet-superkondensatora.html", { esr: "-1" }, "ESR не может быть отрицательным");
await invalid("raschet-superkondensatora.html", { eolc: "100" }, "Снижение ёмкости к концу срока");
await invalid("raschet-superkondensatora.html", { eolr: "-5" }, "Рост ESR к концу срока не может быть отрицательным");
await invalid("raschet-superkondensatora.html", { ilk: "abc" }, "Ток утечки — число");
await invalid("raschet-superkondensatora.html", { ilk: "0" }, "Ток утечки должен быть больше нуля");
await invalid("raschet-superkondensatora.html", { v1: "3000" }, "больше 1000 элементов последовательно");

// --- 4. tok-vyravnivaniya-akb: правило Кирхгофа, Victron ---
// Эталон 1 (пример на странице, паспорт ECO-WORTHY 25 мОм): ΣR = 25 + 25 + 2 = 52 мОм; I = 0,5 / 0,052 = 9,615 А;
// ток равен 50 А при 50·0,052 = 2,6 В; мощность 0,5·9,615 = 4,808 Вт.
await calculateWithout("tok-vyravnivaniya-akb.html", {}, ["Разница напряжений покоя ΔU0,5 В — сильнее разряжена вторая АКБ", "Сопротивление контура R1 + R2 + Rпер52 мОм", "Начальный ток выравнивания I = ΔU / ΣR9,615 А", "Допустимый ток заряда (вторая АКБ) / разряда (первая АКБ)50 / 100 А", "Разница напряжений, при которой ток равен допустимому2,6 В", "Мощность потерь в контуре в первый момент ΔU·I4,808 Вт", "СтатусОценка: начальный ток выравнивания 9,615 А не больше допустимых токов АКБ", "предохранитель (Victron)"], ["выровняйте"]);
// Эталон 2: 5 + 5 + 1 = 11 мОм, 1 В → 90,91 А > 50 А заряда; предел при 50·0,011 = 0,55 В; 1·90,91 = 90,91 Вт.
await calculateWithout("tok-vyravnivaniya-akb.html", { u1: "12,4", u2: "13,4", r1: "5", r2: "5", rw: "1" }, ["1 В — сильнее разряжена первая АКБ", "11 мОм", "Начальный ток выравнивания I = ΔU / ΣR90,91 А", "Допустимый ток заряда (первая АКБ) / разряда (вторая АКБ)50 / 100 А", "0,55 В", "90,91 Вт", "СтатусНачальный ток выравнивания 90,91 А больше допустимого тока заряда — до соединения уменьшите разницу напряжений до 0,55 В, выровняв заряд АКБ", "Вывод следует из самого расчёта"], ["Оценка", "Victron для своих литиевых батарей указывает"]);
await calculate("tok-vyravnivaniya-akb.html", { u1: "12,4", u2: "13,4", r1: "5", r2: "5", rw: "1", idis: "60" }, ["больше допустимого тока заряда и разряда — до соединения уменьшите разницу напряжений до 0,55 В, выровняв заряд АКБ"]);
await calculate("tok-vyravnivaniya-akb.html", { u1: "12,4", u2: "13,4", r1: "5", r2: "5", rw: "1", ich: "100", idis: "60" }, ["больше допустимого тока разряда — до соединения уменьшите разницу напряжений до 0,66 В, выровняв заряд АКБ"]);
// Разные батареи: без превышения — «Недостаточно данных» (допустимость — по паспорту, а не «изготовители требуют
// одинаковые»: Victron Lithium NG допускает в параллели разную ёмкость и возраст — находка независимого проверяющего).
await calculateWithout("tok-vyravnivaniya-akb.html", { same: "diff" }, ["СтатусНедостаточно данных: батареи разные — допустима ли их параллельная работа, указано в паспорте", "допускает в параллели разную ёмкость и возраст"], ["Оценка", "выровняв", "одной ёмкости и одного артикула", "изготовители требуют"]);
await calculate("tok-vyravnivaniya-akb.html", { same: "diff", u1: "12,4", u2: "13,4", r1: "5", r2: "5", rw: "1" }, ["СтатусНачальный ток выравнивания 90,91 А больше допустимого тока заряда — до соединения уменьшите разницу напряжений до 0,55 В, выровняв заряд АКБ; батареи к тому же разные — допустима ли их параллельная работа, указано в паспорте"]);
// Предохранитель 5 А: 9,615 / 5 = 1,923·In — риск срабатывания, хотя ток в пределах АКБ.
await calculate("tok-vyravnivaniya-akb.html", { inf: "5" }, ["Ток относительно номинала предохранителя1,923·In", "СтатусРиск срабатывания предохранителя: начальный ток 9,615 А больше его номинала 5 А, хотя и в пределах допустимых токов АКБ", "время-токовой характеристике"]);
await calculateWithout("tok-vyravnivaniya-akb.html", { u2: "13,4" }, ["Разница напряжений покоя ΔU0 В", "Начальный ток выравнивания I = ΔU / ΣR0 А", "СтатусОценка: напряжения покоя равны"], ["сильнее разряжена", "Допустимый ток заряда ("]);
// Граница 50 А: 2,6 / 0,052 = 50 А — в пределах; 2,6001 / 0,052 = 50,002 А — больше (показано 50,002, а не 50).
await calculateWithout("tok-vyravnivaniya-akb.html", { u2: "10,8" }, ["Начальный ток выравнивания I = ΔU / ΣR50 А", "СтатусОценка: начальный ток выравнивания 50 А не больше допустимых токов АКБ"], ["выровняв"], "boundary");
await calculateWithout("tok-vyravnivaniya-akb.html", { u2: "10,7999" }, ["Начальный ток выравнивания I = ΔU / ΣR50,002 А", "Разница напряжений, при которой ток равен допустимому2,6 В", "СтатусНачальный ток выравнивания 50,002 А больше допустимого тока заряда"], ["Оценка"], "boundary");
// Батареи разного номинального напряжения (находка проверяющего): 25,6 и 12,8 В — не «выровняйте заряд», а «не соединяйте».
// Граница — разница в четверть большего напряжения: 16 и 12 В (ΔU = 4 = 0,25·16) — ещё обычное превышение тока
// (4 / 0,052 = 76,92 А > 50 А), 16 и 11,99 В — «не соединяйте».
await calculateWithout("tok-vyravnivaniya-akb.html", { u1: "25,6", u2: "12,8", same: "diff" }, ["СтатусНе соединяйте параллельно: напряжения различаются больше чем на четверть"], ["выровняв", "уменьшите разницу"]);
await calculate("tok-vyravnivaniya-akb.html", { u1: "16", u2: "12" }, ["Начальный ток выравнивания I = ΔU / ΣR76,92 А", "СтатусНачальный ток выравнивания 76,92 А больше допустимого тока заряда — до соединения уменьшите разницу напряжений до 2,6 В"], "boundary");
await calculateWithout("tok-vyravnivaniya-akb.html", { u1: "16", u2: "11,99" }, ["СтатусНе соединяйте параллельно"], ["уменьшите разницу"], "boundary");
// Граница номинала предохранителя: 1 / 0,05 = 20 А при In = 20 А — не больше; при 19,99 А — риск.
await calculateWithout("tok-vyravnivaniya-akb.html", { u1: "13", u2: "12", r1: "20", r2: "20", rw: "10", ich: "20", inf: "20" }, ["Начальный ток выравнивания I = ΔU / ΣR20 А", "1·In", "СтатусОценка: начальный ток выравнивания 20 А не больше допустимых токов АКБ"], ["Риск"], "boundary");
await calculate("tok-vyravnivaniya-akb.html", { u1: "13", u2: "12", r1: "20", r2: "20", rw: "10", ich: "50", inf: "19,99" }, ["СтатусРиск срабатывания предохранителя: начальный ток 20 А больше его номинала 19,99 А"], "boundary");
await invalid("tok-vyravnivaniya-akb.html", { u1: "13,4 В" }, "Заполните напряжения");
await invalid("tok-vyravnivaniya-akb.html", { u1: "0" }, "Напряжения АКБ — больше 0");
await invalid("tok-vyravnivaniya-akb.html", { u2: "1000,1" }, "Напряжения АКБ — больше 0");
await invalid("tok-vyravnivaniya-akb.html", { r1: "0" }, "Внутреннее сопротивление АКБ должно быть больше нуля");
await invalid("tok-vyravnivaniya-akb.html", { rw: "-1" }, "Сопротивление перемычек не может быть отрицательным");
await invalid("tok-vyravnivaniya-akb.html", { ich: "0" }, "Допустимые токи заряда и разряда должны быть больше нуля");
await invalid("tok-vyravnivaniya-akb.html", { inf: "abc" }, "Номинал предохранителя — число");
await invalid("tok-vyravnivaniya-akb.html", { inf: "0" }, "Номинал предохранителя должен быть больше нуля");

// Структурные проверки партии №4: запрещённые формулировки, карточка
// источника, реестр, видимость полей по режиму (правило 7), ссылки на
// соседние страницы вместо дублирования, входящие ссылки, лимит «Смотрите
// также».
{
  kind = "structural";
  const batch4 = ["balansirovka-yacheek-bms", "tok-razryada-liion-sborki", "raschet-superkondensatora", "tok-vyravnivaniya-akb"];
  const read = file => fs.readFileSync(path.join(sourceDir, file), "utf8");
  const visible = file => read(file).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const registry = read("ENGINEERING_AUDIT.md");
  for (const slug of batch4) {
    const html = read(`${slug}.html`);
    const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1] ?? "";
    check(!/проходит|безопасн|соответствует норм/i.test(visible(`${slug}.html`)) && !/проходит|безопасн|соответствует норм/i.test(script),
      `${slug}: запрещённые слова «проходит», «безопасно», «соответствует нормам»`);
    const card = html.match(/<section class="src">([\s\S]*?)<\/section>/)?.[1] ?? "";
    check(card.includes("Оценка, не нормативный вердикт") && card.includes("Границы применимости") && card.includes("Допущения")
      && card.includes("Редакция") && /обращение 30\.09\.2026/.test(card) && !/Проверил:/.test(card),
      `${slug}: карточка источника без статуса, допущений, границ, редакции или даты обращения`);
    check(registry.includes(`\`${slug}\``), `ENGINEERING_AUDIT.md: нет записи о ${slug}`);
    check(/<a class="ccard"[^>]*href="/.test(read("index.html")) && read("index.html").includes(`href="${slug}.html"`), `index.html: ${slug} нет в каталоге`);
  }
  // Каждый переключатель влияет на расчёт, ненужные поля скрыты.
  const vis = (d, id) => d.getElementById(`f_${id}`)?.style.display !== "none";
  const change = (dom, id, value) => { const el = dom.window.document.getElementById(id); el.value = value; el.dispatchEvent(new dom.window.Event("change", { bubbles: true })); };
  let dom = await load("balansirovka-yacheek-bms.html"); let d = dom.window.document;
  check(vis(d, "dsoc") && !vis(d, "dah") && !vis(d, "chem") && !vis(d, "du") && !vis(d, "slope") && vis(d, "rb") && vis(d, "rsw") && !vis(d, "ib"),
    "balansirovka-yacheek-bms: в режиме «% SoC» и «по сопротивлению» видны только их поля");
  change(dom, "dmode", "ah"); change(dom, "imode", "i");
  check(!vis(d, "dsoc") && vis(d, "dah") && !vis(d, "du") && !vis(d, "rb") && !vis(d, "rsw") && vis(d, "ib"),
    "balansirovka-yacheek-bms: режимы «А·ч» и «ток по паспорту» показывают свои поля");
  change(dom, "dmode", "volt");
  check(vis(d, "chem") && vis(d, "du") && vis(d, "slope"), "balansirovka-yacheek-bms: для NMC по напряжению нужен наклон кривой OCV");
  change(dom, "chem", "lfp");
  check(vis(d, "du") && !vis(d, "slope"), "balansirovka-yacheek-bms: для LiFePO₄ наклон не используется и скрыт");
  dom.window.close();
  dom = await load("tok-razryada-liion-sborki.html"); d = dom.window.document;
  check(vis(d, "ica") && vis(d, "ipa") && !vis(d, "crc") && !vis(d, "crp") && vis(d, "pl") && vis(d, "eta") && vis(d, "ppk") && !vis(d, "il") && !vis(d, "ipk"),
    "tok-razryada-liion-sborki: в режимах «амперы» и «мощность» видны только их поля");
  change(dom, "spec", "c"); change(dom, "lmode", "i");
  check(!vis(d, "ica") && !vis(d, "ipa") && vis(d, "crc") && vis(d, "crp") && !vis(d, "pl") && !vis(d, "eta") && !vis(d, "ppk") && vis(d, "il") && vis(d, "ipk"),
    "tok-razryada-liion-sborki: режимы «C-rate» и «ток» показывают свои поля");
  dom.window.close();
  dom = await load("raschet-superkondensatora.html"); d = dom.window.document;
  check(vis(d, "pw") && vis(d, "eta") && !vis(d, "il"), "raschet-superkondensatora: в режиме мощности поле тока скрыто");
  change(dom, "mode", "i");
  check(!vis(d, "pw") && !vis(d, "eta") && vis(d, "il"), "raschet-superkondensatora: в режиме тока скрыты мощность и КПД");
  dom.window.close();
  // Не дублировать соседние страницы, а ссылаться на них.
  const links = { "tok-razryada-liion-sborki": "liion-charge-current", "raschet-superkondensatora": "energiya-kondensatora",
    "tok-vyravnivaniya-akb": "batareya-posledovatelno-parallelno", "balansirovka-yacheek-bms": "batareya-posledovatelno-parallelno" };
  for (const [from, to] of Object.entries(links)) {
    const article = read(`${from}.html`).match(/<p class="intro">[\s\S]*?<section class="related">/)?.[0] ?? "";
    check(article.includes(`href="${to}.html"`), `${from}: в тексте нет ссылки на ${to}`);
  }
  // Входящие ссылки на новые страницы из «Смотрите также» существующих.
  const inbound = [["liion-charge-current", "tok-razryada-liion-sborki"], ["liion-charge-current", "balansirovka-yacheek-bms"],
    ["batareya-posledovatelno-parallelno", "tok-vyravnivaniya-akb"], ["batareya-posledovatelno-parallelno", "balansirovka-yacheek-bms"],
    ["energiya-kondensatora", "raschet-superkondensatora"], ["soedinenie-kondensatorov", "raschet-superkondensatora"],
    ["vnutrennee-soprotivlenie", "tok-vyravnivaniya-akb"], ["raschet-invertora", "tok-razryada-liion-sborki"]];
  for (const [from, to] of inbound) {
    const block = read(`${from}.html`).match(/<section class="related">([\s\S]*?)<\/section>/)?.[1] ?? "";
    check(block.includes(`href="${to}.html"`), `${from}: в «Смотрите также» нет ссылки на ${to}`);
  }
  // Блок «Смотрите также» — не больше пяти ссылок на любой странице каталога.
  for (const file of htmlFiles) {
    const block = read(file).match(/<section class="related">([\s\S]*?)<\/section>/)?.[1];
    if (block === undefined) continue;
    const n = (block.match(/<li>/g) || []).length;
    check(n <= 5, `${file}: в «Смотрите также» ${n} ссылок, допустимо не больше 5`);
  }
  // Смысловые проверки: что источник не подтверждает, не выдаётся за норму.
  const bal = visible("balansirovka-yacheek-bms.html");
  check(/LiFePO₄/.test(bal) && /не пересчитывает/.test(bal) && /2·R/.test(bal) && /SLUAA81/.test(bal),
    "balansirovka-yacheek-bms: не сказано, что разница напряжений LiFePO₄ не пересчитывается, или нет формулы TI");
  const dis = visible("tok-razryada-liion-sborki.html");
  check(/0,75/.test(dis) && /Littelfuse/.test(dis) && /постоянного тока/.test(dis) && /отключающая способность/i.test(dis) && /Orion BMS/.test(dis),
    "tok-razryada-liion-sborki: требования к предохранителю и BMS не приписаны источникам");
  const sc = visible("raschet-superkondensatora.html");
  check(/√\(4·R·P\/η\)/.test(sc) && /50 токов утечки/.test(sc) && /более чем из двух элементов/.test(sc) && /R = 0/.test(sc),
    "raschet-superkondensatora: нет вывода формулы с ESR, правила Eaton или требования Maxwell");
  const eqp = visible("tok-vyravnivaniya-akb.html");
  check(/предохранитель/.test(eqp) && /до параллельного соединения|до соединения/.test(eqp) && !/соедин[^.]{0,40}(напрямую|и посмотр)/i.test(eqp),
    "tok-vyravnivaniya-akb: нет требования выровнять заряд и поставить предохранитель или есть совет соединять напрямую");
}


// ===========================================================================
// --- Партия №4, data_p.py ---
// Аккумуляторы и накопители: стоимость 1 кВт·ч за срок службы, контроллер
// заряда MPPT/PWM, время работы ИБП по закону Пейкерта, саморазряд при
// хранении. Эталоны посчитаны отдельным скриптом (scratchpad p/ref.py) по
// формулам источников с округлением как у toPrecision (половина — вверх), а
// не кодом страниц; расчёт показан в комментариях. Два эталона взяты прямо
// из источников: пример Википедии для закона Пейкерта (100 А·ч, C20, k = 1,2,
// 10 А → 87 А·ч) и пример Victron (100 А·ч при C20 и 56 А·ч при C2), а для
// саморазряда — таблица EnerSys SBS XC (1,25 % при 20 °C → 5 % при 40 °C).
// ===========================================================================

// --- 1. stoimost-kvtch-akkumulyatora: LCOS Schmidt et al. (2019) без дисконтирования ---
// Паспортная ёмкость — ёмкость разряда, поэтому отданная энергия C·U·DoD — без КПД цикла; КПД задаёт энергию
// на заряд E/η (замечание независимого проверяющего). Эталоны — scratchpad b4/cost_ref.py, не код страницы.
// Эталон 1 (по умолчанию): A — 100·12·0,5 = 600 Вт·ч за цикл; N = min(600, 7·365 = 2555) = 600; E = 360 кВт·ч;
// 20000/360 = 55,56 ₽/кВт·ч; цикл 33,33 ₽; 600/365 = 1,644 года; на заряд 360/0,8 = 450 кВт·ч.
// B — 100·12,8·0,8 = 1024 Вт·ч; срок не задан → N = 2500, E = 2560 кВт·ч, 23,44 ₽/кВт·ч, цикл 24 ₽, 6,849 года;
// на заряд 2560/0,92 = 2783 кВт·ч. Безубыточный срок B: 60000/55,556/1,024/365 = 2,89 года.
await calculateWithout("stoimost-kvtch-akkumulyatora.html", {}, [
  "A: энергия за цикл C·U·DoD0,6 кВт·ч", "A: ресурс по паспорту600 циклов — выработается за 1,644 года",
  "A: предел календарного срока — 7 лет × 365 цикл/год2555 циклов", "A: циклов за срок службы600 — ограничивает ресурс циклов",
  "A: энергия за срок службы E360 кВт·ч", "A: энергия на заряд за срок службы E / η450 кВт·ч", "A: стоимость одного цикла33,33 ₽", "A: стоимость 1 кВт·ч55,56 ₽/кВт·ч",
  "B: энергия за цикл C·U·DoD1,024 кВт·ч", "B: ресурс по паспорту2500 циклов — выработается за 6,849 года",
  "B: календарный срокне задан — ограничение не проверено", "B: энергия за срок службы E2560 кВт·ч", "B: энергия на заряд за срок службы E / η2783 кВт·ч", "B: стоимость одного цикла24 ₽",
  "B: стоимость 1 кВт·ч23,44 ₽/кВт·ч — если прослужит 6,849 года", "Календарный срок, при котором вариант B дешевле Aне меньше 2,89 года",
  "СтатусНедостаточно данных: вариант B дешевле варианта A, если его календарный срок не меньше 2,89 года"], ["Оценка: вариант B дешевле", "Статус Оценка", "C·U·DoD·η"]);
// Эталон 2: резерв, 20 циклов в год, срок B 15 лет. A: 7·20 = 140 < 600 → календарный срок, E = 84 кВт·ч, 238,1 ₽/кВт·ч,
// цикл 142,9 ₽. B: 15·20 = 300 < 2500, E = 300·1,024 = 307,2 кВт·ч, 195,3 ₽/кВт·ч, цикл 200 ₽; 238,10/195,31 = 1,219.
await calculate("stoimost-kvtch-akkumulyatora.html", { cy: "20", lb: "15" }, [
  "A: предел календарного срока — 7 лет × 20 цикл/год140 циклов", "A: циклов за срок службы140 — ограничивает календарный срок",
  "A: энергия за срок службы E84 кВт·ч", "A: стоимость одного цикла142,9 ₽", "A: стоимость 1 кВт·ч238,1 ₽/кВт·ч",
  "B: ресурс по паспорту2500 циклов — выработается за 125 лет", "B: предел календарного срока — 15 лет × 20 цикл/год300 циклов",
  "B: энергия за срок службы E307,2 кВт·ч", "B: стоимость одного цикла200 ₽", "B: стоимость 1 кВт·ч195,3 ₽/кВт·ч",
  "СтатусОценка: вариант B дешевле за 1 кВт·ч в 1,219 раза: 195,3 ₽ против 238,1 ₽"]);
// КПД влияет только на энергию заряда, а не на стоимость отданного кВт·ч (правило 7: поле η меняет результат).
await calculate("stoimost-kvtch-akkumulyatora.html", { mode: "one", ea: "50" }, ["A: энергия на заряд за срок службы E / η720 кВт·ч", "A: стоимость 1 кВт·ч55,56 ₽/кВт·ч"]);
// Один аккумулятор: вариант B скрыт и не читается — мусор в его полях не мешает (правило 7).
await calculateWithout("stoimost-kvtch-akkumulyatora.html", { mode: "one", pb: "abc", lb: "abc" }, [
  "A: стоимость 1 кВт·ч55,56 ₽/кВт·ч", "СтатусОценка: 1 кВт·ч за срок службы обходится в 55,56 ₽; ограничивает ресурс циклов"], ["B:", "Вариант B"]);
await calculate("stoimost-kvtch-akkumulyatora.html", { mode: "one", la: "" }, [
  "A: календарный срокне задан — ограничение не проверено", "A: стоимость 1 кВт·ч55,56 ₽/кВт·ч — если прослужит 1,644 года",
  "СтатусОценка без проверки календарного срока: 55,56 ₽/кВт·ч, если аккумулятор прослужит 1,644 года"]);
// Дорогой B без срока: его стоимость — только нижняя граница 400000/2560 = 156,3, и A дешевле при любом сроке B.
await calculate("stoimost-kvtch-akkumulyatora.html", { pb: "400000" }, [
  "СтатусОценка: вариант A дешевле при любом календарном сроке варианта B: 55,56 ₽/кВт·ч против не меньше 156,3 ₽/кВт·ч"]);
// Равные стоимости, но срок B неизвестен — сравнить нельзя: «Недостаточно данных», а не «Оценка» (правило 6).
await calculateWithout("stoimost-kvtch-akkumulyatora.html", { pb: "20000", ub: "12", db: "50", nb: "600", eb: "80", lb: "" }, [
  "СтатусНедостаточно данных: без календарного срока варианта B стоимости не сравнить — задайте срок по паспорту"], ["СтатусОценка"], "boundary");
// Граница «ресурс или календарный срок» при 100 циклах в год: 6 лет → 600 = 600 — ресурс; 5,99 → 599 — срок
// (E = 599·0,6 = 359,4 кВт·ч, 55,65 ₽/кВт·ч); 6,01 → 601 — снова ресурс.
await calculate("stoimost-kvtch-akkumulyatora.html", { mode: "one", cy: "100", la: "6" }, ["A: предел календарного срока — 6 лет × 100 цикл/год600 циклов", "A: циклов за срок службы600 — ограничивает ресурс циклов", "ограничивает ресурс циклов"], "boundary");
await calculate("stoimost-kvtch-akkumulyatora.html", { mode: "one", cy: "100", la: "5,99" }, ["A: предел календарного срока — 5,99 года × 100 цикл/год599 циклов", "A: циклов за срок службы599 — ограничивает календарный срок", "A: энергия за срок службы E359,4 кВт·ч", "СтатусОценка: 1 кВт·ч за срок службы обходится в 55,65 ₽; ограничивает календарный срок"], "boundary");
await calculate("stoimost-kvtch-akkumulyatora.html", { mode: "one", cy: "100", la: "6,01" }, ["A: циклов за срок службы600 — ограничивает ресурс циклов"], "boundary");
// Условие безубыточности согласовано с прямым расчётом: срок B 2,9 года — B дешевле в 1,004 раза,
// 2,88 года — уже A дешевле в 1,003 раза.
await calculate("stoimost-kvtch-akkumulyatora.html", { lb: "2,9" }, ["СтатусОценка: вариант B дешевле за 1 кВт·ч в 1,004 раза: 55,36 ₽ против 55,56 ₽"], "boundary");
await calculate("stoimost-kvtch-akkumulyatora.html", { lb: "2,88" }, ["СтатусОценка: вариант A дешевле за 1 кВт·ч в 1,003 раза: 55,56 ₽ против 55,74 ₽"], "boundary");
// Почти равные цены: 20000 и 20000,02 ₽ при одинаковых данных: отношение 1,000001 — показаны столько знаков,
// чтобы не округлиться в «1 раз» и в равные цены.
await calculate("stoimost-kvtch-akkumulyatora.html", { pb: "20000,02", ub: "12", db: "50", nb: "600", eb: "80", lb: "7" }, ["СтатусОценка: вариант A дешевле за 1 кВт·ч в 1,000001 раза: 55,5556 ₽ против 55,56 ₽"], "boundary");
await calculate("stoimost-kvtch-akkumulyatora.html", { ub: "12", db: "50", nb: "600", eb: "80", lb: "7", pb: "20000" }, ["СтатусОценка: стоимость 1 кВт·ч у вариантов одинакова — 55,56 ₽"], "boundary");
await invalid("stoimost-kvtch-akkumulyatora.html", { da: "0" }, "Вариант A: глубина разряда задаётся в процентах");
await invalid("stoimost-kvtch-akkumulyatora.html", { db: "101" }, "Вариант B: глубина разряда задаётся в процентах");
await invalid("stoimost-kvtch-akkumulyatora.html", { ea: "0" }, "Вариант A: КПД цикла задаётся в процентах");
await invalid("stoimost-kvtch-akkumulyatora.html", { pa: "двадцать тысяч" }, "Вариант A: заполните цену");
await invalid("stoimost-kvtch-akkumulyatora.html", { lb: "десять" }, "Вариант B: календарный срок службы — число лет");
await invalid("stoimost-kvtch-akkumulyatora.html", { la: "-1" }, "календарный срок службы должен быть больше нуля");
await invalid("stoimost-kvtch-akkumulyatora.html", { na: "0,5" }, "ресурс — не меньше одного цикла");
await invalid("stoimost-kvtch-akkumulyatora.html", { cy: "0" }, "Число циклов в год должно быть больше нуля");

// --- 2. kontroller-zaryada-mppt-pwm: NEC 690.8 (Morningstar), Victron, Morningstar ---
// Эталон 1 (по умолчанию, PWM): три панели Victron BlueSolar 115 Вт параллельно: Isc 3·6,61 = 19,83 А, Vmp 19 В, 345 Вт.
// NEC: 1,25·19,83 = 24,79 ≤ 30 А. Imp = 345/19 = 18,16 А; при 12 В — 12·18,16 = 217,9 и min(12·19,83, 345) = 238 Вт,
// 63,16…68,97 % мощности массива; Vmp 19 > 14,4 В.
await calculate("kontroller-zaryada-mppt-pwm.html", {}, [
  "1,25·Isc (NEC 690.8) и номинальный ток контроллера24,79 А ≤ 30 А", "Ток массива в АКБ при STC — от Imp до Isc18,16…19,83 А",
  "Мощность в АКБ при 12 В — от U·Imp до U·Isc217,9…238 Вт из 345 Вт (63,16…68,97 %)", "Vmp массива и наибольшее напряжение заряда19 В > 14,4 В",
  "СтатусОценка: условие по току КЗ выполнено; PWM передаст в АКБ около 63,16…68,97 % мощности массива при STC", "PWM-контроллер перегружать нельзя"]);
// Эталон 2 (MPPT, перегруз): две цепочки по две панели: Isc 13,22 А, Vmp 38 В, 460 Вт; NEC 1,25·13,22 = 16,53 А.
// Iвых = 460·0,98/12 = 37,57 А > 30 А; мощность при номинальном токе 30·12/0,98 = 367,3 Вт; превышение 25,22 %.
const mppt460 = { tip: "mppt", isc: "13,22", vmp: "38", pw: "460" };
await calculateWithout("kontroller-zaryada-mppt-pwm.html", mppt460, [
  "1,25·Isc (NEC 690.8) и номинальный ток контроллера16,53 А ≤ 30 А", "Ток на выходе при STC Iвых = P·η / Uмин37,57 А",
  "Мощность массива, при которой ток на выходе равен номинальному367,3 Вт", "Превышение мощности массива над ней25,22 %",
  "СтатусНедостаточно данных: ток на выходе при STC 37,57 А больше номинального 30 А — допустим ли такой перегруз по мощности, указывает только производитель контроллера"], ["Оценка:"]);
await calculate("kontroller-zaryada-mppt-pwm.html", { ...mppt460, ovp: "isc" }, ["СтатусОценка: массив мощнее номинала контроллера — ток на выходе ограничится 30 А; перегруз допускается производителем при соблюдении предела по току КЗ"]);
await calculate("kontroller-zaryada-mppt-pwm.html", { ...mppt460, ovp: "pmax", pmax: "500" }, ["Мощность массива и предел производителя460 Вт ≤ 500 Вт", "СтатусОценка: массив мощнее номинала контроллера — ток на выходе ограничится 30 А; перегруз в пределах мощности, заявленной производителем"]);
await calculateWithout("kontroller-zaryada-mppt-pwm.html", { ...mppt460, ovp: "pmax", pmax: "450" }, ["Мощность массива и предел производителя460 Вт > 450 Вт", "СтатусМощность массива 460 Вт больше допустимой производителем 450 Вт"], ["Оценка:"]);
await calculate("kontroller-zaryada-mppt-pwm.html", { ...mppt460, ovp: "pmax", pmax: "460" }, ["460 Вт ≤ 460 Вт", "СтатусОценка: массив мощнее номинала"], "boundary");
await calculate("kontroller-zaryada-mppt-pwm.html", { ...mppt460, ovp: "pmax", pmax: "459,99" }, ["СтатусМощность массива 460 Вт больше допустимой производителем 459,99 Вт"], "boundary");
// Эталон 3 (MPPT без перегруза): 345·0,98/12 = 28,17 ≤ 30 А.
await calculateWithout("kontroller-zaryada-mppt-pwm.html", { tip: "mppt" }, ["Ток на выходе при STC Iвых = P·η / Uмин28,17 А", "СтатусОценка: условие по току КЗ выполнено, ток на выходе при STC 28,17 А не больше номинального 30 А"], ["Превышение", "Мощность массива, при которой"]);
// Предел мощности производителя проверяется и без перегруза по току: 345 Вт > 300 Вт — вывод без «Оценка»; 345 ≤ 345 — в пределе.
await calculateWithout("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", ovp: "pmax", pmax: "300" }, ["Мощность массива и предел производителя345 Вт > 300 Вт", "СтатусМощность массива 345 Вт больше допустимой производителем 300 Вт"], ["Оценка:"]);
await calculate("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", ovp: "pmax", pmax: "345" }, ["345 Вт ≤ 345 Вт", "СтатусОценка: условие по току КЗ выполнено, ток на выходе при STC 28,17 А не больше номинального 30 А"], "boundary");
// Граница номинального тока MPPT (КПД 100 %): 360/12 = 30 А — не перегруз; 360,01/12 = 30,001 А — перегруз.
await calculate("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", eta: "100", pw: "360" }, ["СтатусОценка: условие по току КЗ выполнено, ток на выходе при STC 30 А не больше номинального 30 А"], "boundary");
await calculate("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", eta: "100", pw: "360,01" }, ["СтатусНедостаточно данных: ток на выходе при STC 30,001 А больше номинального 30 А"], "boundary");
// Граница NEC: Isc 24 → 30 А ≤ 30 А; 24,01 → 30,01 А > 30 А — контроллер не подходит.
await calculate("kontroller-zaryada-mppt-pwm.html", { isc: "24" }, ["1,25·Isc (NEC 690.8) и номинальный ток контроллера30 А ≤ 30 А", "СтатусОценка: условие по току КЗ выполнено"], "boundary");
await calculateWithout("kontroller-zaryada-mppt-pwm.html", { isc: "24,01" }, ["30,01 А > 30 А", "СтатусКонтроллер не подходит по току массива: 1,25·Isc = 30,01 А больше номинального тока 30 А (условие NEC 690.8 в руководствах Morningstar)"], ["Оценка:"], "boundary");
// Предел по паспорту (Victron 100/30 — 35 А): Isc 35 — в пределе, PWM 12·(600/19) = 378,9 и 12·35 = 420 Вт из 600 (63,16…70 %);
// 35,01 — выше предела. Переключатель основания влияет на расчёт: 4 панели параллельно (26,44 А) по NEC — 33,05 > 30, по паспорту — 26,44 ≤ 35.
await calculate("kontroller-zaryada-mppt-pwm.html", { base: "own", isc: "35", pw: "600" }, ["Isc массива и предел по паспорту контроллера35 А ≤ 35 А", "378,9…420 Вт из 600 Вт (63,16…70 %)", "СтатусОценка: условие по току КЗ выполнено"], "boundary");
await calculateWithout("kontroller-zaryada-mppt-pwm.html", { base: "own", isc: "35,01", pw: "600" }, ["Isc массива и предел по паспорту контроллера35,01 А > 35 А", "СтатусТок КЗ массива больше допустимого по паспорту контроллера: 35,01 А > 35 А"], ["Оценка:"], "boundary");
await calculateWithout("kontroller-zaryada-mppt-pwm.html", { isc: "26,44", pw: "460" }, ["1,25·Isc (NEC 690.8) и номинальный ток контроллера33,05 А > 30 А", "СтатусКонтроллер не подходит по току массива"], ["Оценка:"]);
await calculate("kontroller-zaryada-mppt-pwm.html", { base: "own", isc: "26,44", pw: "460" }, ["Isc массива и предел по паспорту контроллера26,44 А ≤ 35 А", "СтатусОценка: условие по току КЗ выполнено"]);
// Vmp и напряжение заряда: 14,4 ≤ 14,4 — риск недозаряда; 14,41 — нет (Imp = 250/14,41 = 17,35 А, 208,2…238 Вт).
await calculateWithout("kontroller-zaryada-mppt-pwm.html", { vmp: "14,4", pw: "250" }, ["Vmp массива и наибольшее напряжение заряда14,4 В ≤ 14,4 В", "СтатусРиск недозаряда: Vmp массива 14,4 В не выше наибольшего напряжения заряда 14,4 В — выше Vmp ток массива быстро падает"], ["Оценка:"], "boundary");
await calculate("kontroller-zaryada-mppt-pwm.html", { vmp: "14,41", pw: "250" }, ["14,41 В > 14,4 В", "Ток массива в АКБ при STC — от Imp до Isc17,35…19,83 А", "208,2…238 Вт из 250 Вт (83,28…95,18 %)", "СтатусОценка"], "boundary");
await calculate("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", vmp: "14", pw: "250" }, ["СтатусРиск недозаряда: Vmp массива 14 В не выше наибольшего напряжения заряда 14,4 В — понижающий MPPT-контроллер не поднимет напряжение выше Vmp"]);
await calculate("kontroller-zaryada-mppt-pwm.html", { vmp: "12", pw: "200" }, ["Мощность в АКБ при 12 Вне оценивается: напряжение АКБ не ниже Vmp", "СтатусРиск недозаряда"], "boundary");
// В режиме PWM поля MPPT не читаются (правило 7): мусор в КПД не мешает.
await calculate("kontroller-zaryada-mppt-pwm.html", { eta: "abc" }, ["СтатусОценка: условие по току КЗ выполнено; PWM передаст"]);
await invalid("kontroller-zaryada-mppt-pwm.html", { pw: "400" }, "не меньше Isc");
await invalid("kontroller-zaryada-mppt-pwm.html", { umax: "11" }, "Наибольшее напряжение заряда не может быть меньше");
await invalid("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", eta: "0" }, "КПД задаётся в процентах");
await invalid("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", ovp: "pmax", pmax: "" }, "Введите наибольшую мощность массива");
await invalid("kontroller-zaryada-mppt-pwm.html", { base: "own", iscmax: "abc" }, "Наибольший ток КЗ массива по паспорту контроллера — число в амперах");
await invalid("kontroller-zaryada-mppt-pwm.html", { base: "own", iscmax: "" }, "Введите наибольший ток КЗ массива по паспорту");
await invalid("kontroller-zaryada-mppt-pwm.html", { isc: "19,83 А" }, "Заполните ток КЗ");
await invalid("kontroller-zaryada-mppt-pwm.html", { irated: "0" }, "должны быть больше нуля");

// --- 3. vremya-raboty-ibp-peukert: Пейкерт (Википедия, Victron), таблицы постоянной мощности ---
// Эталон 1 (Википедия): 100 А·ч при C20, k = 1,2, ток 10 А (120 Вт, 12 В, КПД 100 %):
// t = 20·(100/(10·20))^1,2 = 8,7055 ч, отдаст 87,06 А·ч; C/I = 10 ч; 120/6 = 20 Вт на элемент.
await calculate("vremya-raboty-ibp-peukert.html", { p: "120", u: "12", eta: "100", k: "1,2" }, [
  "Ток батареи I = P / (U·η)10 А", "Ток паспортного режима C/H5 А", "Без поправки на ток t = C/I10 ч",
  "По Пейкерту t = H·(C/(I·H))^k8,71 ч", "Ёмкость, которую батарея отдаст при этом токе87,06 А·ч (87,06 % от C)",
  "Мощность на элемент для таблицы производителя P / (η·n)20 Вт на элемент, n = 6", "СтатусОценка по закону Пейкерта: около 8,71 ч при k = 1,2"]);
// Эталон 2 (Victron): 100 А·ч при 20 ч и 56 А·ч при 2 ч → k = ln(0,1)/ln(5/28) = 1,337; при 28 А (336 Вт) t = 2 ч, 56 А·ч.
await calculate("vremya-raboty-ibp-peukert.html", { kmode: "two", p: "336", u: "12", eta: "100" }, [
  "Показатель Пейкерта k1,337 — по двум точкам паспорта", "По Пейкерту t = H·(C/(I·H))^k2 ч", "Ёмкость, которую батарея отдаст при этом токе56 А·ч (56 % от C)",
  "СтатусОценка по закону Пейкерта: около 2 ч — между паспортными точками 2 и 20 ч"]);
// Эталон 3 (по умолчанию): 300/(24·0,85) = 14,71 А; C/I = 6,8 ч; 20·(100/(14,71·20))^1,25 = 5,19 ч; 76,36 А·ч;
// 300/(0,85·12) = 29,41 Вт на элемент.
await calculate("vremya-raboty-ibp-peukert.html", {}, [
  "Ток батареи I = P / (U·η)14,71 А", "Без поправки на ток t = C/I6,8 ч", "По Пейкерту t = H·(C/(I·H))^k5,19 ч",
  "76,36 А·ч (76,36 % от C)", "29,41 Вт на элемент, n = 12", "СтатусОценка по закону Пейкерта: около 5,19 ч при k = 1,25",
  "таблице разряда постоянной мощностью", "34,3 Вт на элемент"]);
// Граница паспортных точек: 340 Вт → 28,33 А → 1,969 ч < 2 ч — экстраполяция (показано по ту же сторону от 2 ч).
await calculate("vremya-raboty-ibp-peukert.html", { kmode: "two", p: "340", u: "12", eta: "100" }, [
  "По Пейкерту t = H·(C/(I·H))^k1,969 ч", "55,78 А·ч", "СтатусОценка по закону Пейкерта с экстраполяцией: около 1,969 ч — вне паспортных точек 2…20 ч"], "boundary");
// Граница тока паспортного режима: 60 Вт → 5 А = C/H → по Пейкерту ровно 20 ч; 59,99 Вт → 4,999 А — ниже, только C/I.
await calculate("vremya-raboty-ibp-peukert.html", { p: "60", u: "12", eta: "100" }, ["По Пейкерту t = H·(C/(I·H))^k20 ч", "СтатусОценка по закону Пейкерта: около 20 ч при k = 1,25"], "boundary");
await calculateWithout("vremya-raboty-ibp-peukert.html", { p: "59,99", u: "12", eta: "100" }, ["СтатусОценка: около 20 ч = C/I; ток 4,999 А меньше тока паспортного режима C/H = 5 А"], ["По Пейкерту t"], "boundary");
// Рискованный вердикт: при 4 А Пейкерт дал бы 20·(100/80)^1,25 = 26,4 ч — больше паспортной ёмкости; в оценку идёт C/I = 25 ч.
await calculateWithout("vremya-raboty-ibp-peukert.html", { p: "48", u: "12", eta: "100" }, ["По Пейкертуне применяется: ток ниже тока паспортного режима", "СтатусОценка: около 25 ч = C/I"], ["26,4"]);
// k = 1 — формула совпадает с C/I (6,8 ч); k = 1,6 — край диапазона: 20·0,34^1,6 = 3,56 ч.
await calculate("vremya-raboty-ibp-peukert.html", { k: "1" }, ["По Пейкерту t = H·(C/(I·H))^k6,8 ч"], "boundary");
await calculate("vremya-raboty-ibp-peukert.html", { k: "1,6" }, ["По Пейкерту t = H·(C/(I·H))^k3,56 ч"], "boundary");
// Li-ion: 300/(25,6·0,85) = 13,79 А, C/I = 7,25 ч, без Пейкерта; напряжение не обязано быть кратно 2 В, поле H скрыто и не читается.
await calculateWithout("vremya-raboty-ibp-peukert.html", { chem: "li", u: "25,6", h: "abc" }, ["Ток батареи I = P / (U·η)13,79 А", "Без поправки на ток t = C/I7,25 ч", "СтатусОценка без поправки на ток: около 7,25 ч = C/I; закон Пейкерта для Li-ion не применяется", "близок к 1"], ["По Пейкерту", "Показатель Пейкерта k", "Вт на элемент"]);
await invalid("vremya-raboty-ibp-peukert.html", { u: "25,6" }, "кратно 2 В");
await invalid("vremya-raboty-ibp-peukert.html", { u: "13" }, "кратно 2 В");
await invalid("vremya-raboty-ibp-peukert.html", { k: "0,99" }, "от 1 до 1,6");
await invalid("vremya-raboty-ibp-peukert.html", { k: "1,61" }, "от 1 до 1,6");
await invalid("vremya-raboty-ibp-peukert.html", { kmode: "two", h2: "20" }, "должно отличаться от H");
// 100 А·ч при 20 ч и 110 А·ч при 2 ч дают k = 0,9603 < 1 — отклоняется.
await invalid("vremya-raboty-ibp-peukert.html", { kmode: "two", c2: "110" }, "k = 0,9603 — вне диапазона 1…1,6");
await invalid("vremya-raboty-ibp-peukert.html", { kmode: "two", c2: "" }, "Введите вторую ёмкость");
await invalid("vremya-raboty-ibp-peukert.html", { eta: "0" }, "КПД инвертора задаётся в процентах");
await invalid("vremya-raboty-ibp-peukert.html", { p: "300 Вт" }, "Заполните мощность нагрузки");

// --- 4. samorazryad-akkumulyatora: Panasonic (линейно), Victron / EnerSys (удвоение на +10 °C) ---
// Эталон 1 (по умолчанию): 3 %/мес при 20 °C, хранение 30 °C → ×2 → 6 %/мес; 100 − 6·6 = 64 %; порог 90 % — 10/6 = 1,667 мес.;
// экспоненциально 100·0,94^6 = 68,99 %, ln 0,9 / ln 0,94 = 1,703 мес.
await calculateWithout("samorazryad-akkumulyatora.html", {}, [
  "Поправка на температуру 2^((T − Tп)/10)× 2", "Саморазряд при хранении r6 % в месяц", "Заряд через 6 мес. — линейно, как у Panasonic64 %",
  "Время до порога подзаряда 90 %1,667 мес.", "Для сравнения: экспоненциально (1 − r)^t68,99 % через 6 мес., порог — через 1,703 мес.",
  "СтатусПодзаряд нужен не позже чем через 1,667 мес.: к концу хранения (6 мес.) заряд опустится до 64 % при пороге 90 %", "2,10 В на элемент"], ["Оценка:"]);
// Эталон 2 (таблица EnerSys SBS XC): 1,25 %/мес при 20 °C → 1,768 при 25 °C (в таблице 1,76), 2,5 при 30 °C, 5 при 40 °C.
await calculate("samorazryad-akkumulyatora.html", { r: "1,25", temp: "25" }, ["× 1,414", "Саморазряд при хранении r1,768 % в месяц", "89,39 %", "5,657 мес."]);
await calculate("samorazryad-akkumulyatora.html", { r: "1,25", temp: "30" }, ["Саморазряд при хранении r2,5 % в месяц", "Заряд через 6 мес. — линейно, как у Panasonic85 %", "Время до порога подзаряда 90 %4 мес."]);
await calculate("samorazryad-akkumulyatora.html", { r: "1,25", temp: "40" }, ["× 4", "Саморазряд при хранении r5 % в месяц", "70 %", "Время до порога подзаряда 90 %2 мес."], "boundary");
// Эталон 3 (метод Panasonic, 5 %/мес ниже 20 °C): поправка не применяется; 100 − 5·6 = 70 %; порог — через 2 мес.
await calculate("samorazryad-akkumulyatora.html", { r: "5", temp: "15" }, ["не применяется: хранение не теплее паспортной температуры", "Саморазряд при хранении r5 % в месяц", "70 %", "73,51 %", "2,054 мес."]);
// Другая химия: поправки нет, поля температуры скрыты и не читаются: 2 %/мес, 12 мес. → 76 %, порог 50 % — через 25 мес.
await calculateWithout("samorazryad-akkumulyatora.html", { chem: "other", r: "2", th: "50", m: "12", temp: "abc" }, [
  "Заряд через 12 мес. — линейно, как у Panasonic76 %", "Время до порога подзаряда 50 %25 мес.", "78,47 % через 12 мес., порог — через 34,31 мес.",
  "СтатусОценка: через 12 мес. заряд около 76 % — выше порога 50 %; порог — примерно через 25 мес.", "подтверждено только для свинцово-кислотных"], ["Поправка на температуру 2^"]);
// Граница порога: 2 %/мес, 6 мес., порог 88 % — достигается ровно к концу (6 мес.); 87,99 % — через 6,005 мес.; 88,01 % — через 5,995 мес.
await calculateWithout("samorazryad-akkumulyatora.html", { r: "2", temp: "20", th: "88" }, ["СтатусПодзаряд нужен не позже чем через 6 мес.: к концу хранения (6 мес.) заряд опустится до 88 % при пороге 88 %"], ["Оценка:"], "boundary");
await calculate("samorazryad-akkumulyatora.html", { r: "2", temp: "20", th: "87,99" }, ["СтатусОценка: через 6 мес. заряд около 88 % — выше порога 87,99 %; порог — примерно через 6,005 мес."], "boundary");
await calculate("samorazryad-akkumulyatora.html", { r: "2", temp: "20", th: "88,01" }, ["СтатусПодзаряд нужен не позже чем через 5,995 мес."], "boundary");
await calculateWithout("samorazryad-akkumulyatora.html", { s0: "90" }, ["СтатусПодзарядите перед хранением: начальный заряд 90 % не выше порога 90 %"], ["Время до порога"], "boundary");
await calculate("samorazryad-akkumulyatora.html", { s0: "90,01" }, ["Время до порога подзаряда 90 %0,001667 мес."], "boundary");
await calculate("samorazryad-akkumulyatora.html", { r: "5", temp: "20", m: "30" }, ["0 % — полный разряд через 20 мес."]);
await calculate("samorazryad-akkumulyatora.html", { temp: "40" }, ["Саморазряд при хранении r12 % в месяц"], "boundary");
await calculate("samorazryad-akkumulyatora.html", { temp: "-40" }, ["Саморазряд при хранении r3 % в месяц"], "boundary");
await invalid("samorazryad-akkumulyatora.html", { temp: "40,01" }, "Выше 40 °C удвоение");
await invalid("samorazryad-akkumulyatora.html", { temp: "-40,01" }, "ниже −40 °C");
await invalid("samorazryad-akkumulyatora.html", { tref: "14,99" }, "от 15 до 30 °C");
await invalid("samorazryad-akkumulyatora.html", { tref: "30,01" }, "от 15 до 30 °C");
// 30 %/мес при 15 °C, хранение 40 °C: ×2^2,5 → 169,7 %/мес — вне модели.
await invalid("samorazryad-akkumulyatora.html", { r: "30", tref: "15", temp: "40" }, "169,7 % в месяц — вне модели");
await invalid("samorazryad-akkumulyatora.html", { r: "0" }, "Саморазряд задаётся в процентах в месяц");
await invalid("samorazryad-akkumulyatora.html", { r: "100" }, "Саморазряд задаётся в процентах в месяц");
await invalid("samorazryad-akkumulyatora.html", { s0: "100,1" }, "Начальный заряд");
await invalid("samorazryad-akkumulyatora.html", { th: "0" }, "Порог подзаряда");
await invalid("samorazryad-akkumulyatora.html", { m: "0" }, "Срок хранения должен быть больше нуля");
await invalid("samorazryad-akkumulyatora.html", { m: "полгода" }, "Заполните саморазряд");

// Структурные проверки партии №4: запрещённые формы вердикта, карточка
// источника, видимость полей по режиму (правило 7), ссылки на существующие
// страницы вместо дублирования, входящие ссылки и не больше 5 ссылок в
// «Смотрите также» по всему каталогу.
{
  kind = "structural";
  const batch4 = ["stoimost-kvtch-akkumulyatora", "kontroller-zaryada-mppt-pwm", "vremya-raboty-ibp-peukert", "samorazryad-akkumulyatora"];
  const visible = file => fs.readFileSync(path.join(sourceDir, file), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const registry = fs.readFileSync(path.join(sourceDir, "ENGINEERING_AUDIT.md"), "utf8");
  for (const slug of batch4) {
    const html = fs.readFileSync(path.join(sourceDir, `${slug}.html`), "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1] ?? "";
    check(!/проходит|безопасн|соответствует норм/i.test(visible(`${slug}.html`)) && !/проходит|безопасн|соответствует норм/i.test(script),
      `${slug}: запрещённые слова «проходит», «безопасно», «соответствует нормам»`);
    const card = html.match(/<section class="src">([\s\S]*?)<\/section>/)?.[1] ?? "";
    check(card.includes("Оценка, не нормативный вердикт") && card.includes("Границы применимости") && card.includes("Редакция") && /обращение 30\.09\.2026/.test(card) && !/Проверил:/.test(card),
      `${slug}: карточка источника без статуса «Оценка», границ, редакции или даты обращения — либо с выдуманным проверяющим`);
    check(registry.includes(`\`${slug}\``), `ENGINEERING_AUDIT.md: нет записи о ${slug}`);
  }
  const page = slug => fs.readFileSync(path.join(sourceDir, `${slug}.html`), "utf8");
  // Voc на холоде проверяет существующая страница — здесь ссылка, а не второй расчёт.
  check(/href="solnechnye-paneli-massiv\.html"/.test(page("kontroller-zaryada-mppt-pwm")) && !/id="tmin"|id="beta"|id="voc"/.test(page("kontroller-zaryada-mppt-pwm")),
    "kontroller-zaryada-mppt-pwm: проверка Voc на холоде должна остаться на странице массива, здесь — только ссылка");
  check(/href="vremya-raboty-akkumulyatora\.html"/.test(page("vremya-raboty-ibp-peukert")),
    "vremya-raboty-ibp-peukert: нет ссылки на простой расчёт времени работы от аккумулятора");
  const peukert = visible("vremya-raboty-ibp-peukert.html");
  check(/разряда постоянной мощностью/.test(peukert) && /оптимистичен/.test(peukert) && /Li-ion/.test(peukert) && /близок к 1/.test(peukert),
    "vremya-raboty-ibp-peukert: нет оговорки о таблицах постоянной мощности, приближённости формулы или неприменимости для Li-ion");
  const cost = visible("stoimost-kvtch-akkumulyatora.html");
  check(/не интерполирует/.test(cost) && /не подставляет/.test(cost), "stoimost-kvtch-akkumulyatora: не сказано, что паспортные ресурс и срок не интерполируются и не подставляются");
  const sd = visible("samorazryad-akkumulyatora.html");
  check(/только для свинцово-кислотных|подтверждено только для свинцово-кислотных|Для других химий удвоение/.test(sd), "samorazryad-akkumulyatora: удвоение на +10 °C не ограничено свинцово-кислотными VRLA");
  const inbound = { "vremya-raboty-akkumulyatora": "vremya-raboty-ibp-peukert", "solnechnye-paneli-massiv": "kontroller-zaryada-mppt-pwm",
    "raschet-akb-avtonomnoy": "stoimost-kvtch-akkumulyatora", "battery-charge-time": "samorazryad-akkumulyatora" };
  for (const [from, to] of Object.entries(inbound)) {
    const block = page(from).match(/<section class="related">([\s\S]*?)<\/section>/)?.[1] ?? "";
    check(block.includes(`href="${to}.html"`), `${from}: в «Смотрите также» нет ссылки на ${to}`);
  }
  // Ограничение «не больше 5 ссылок» по всему каталогу проверяется в блоке data_o.py.
  // Видимость полей по режиму: скрытое поле не влияет на расчёт, видимое — влияет.
  const state = async (file, values) => {
    const dom = await load(file); const d = dom.window.document;
    for (const [id, v] of Object.entries(values)) { const el = d.getElementById(id); el.value = v; el.dispatchEvent(new dom.window.Event("change", { bubbles: true })); }
    const hidden = new Set([...d.querySelectorAll(".f")].filter(f => f.style.display === "none").map(f => f.id.replace(/^f_/, "")));
    dom.window.close(); return hidden;
  };
  let hs = await state("stoimost-kvtch-akkumulyatora.html", {});
  check(!hs.has("pb") && !hs.has("lb"), "stoimost-kvtch-akkumulyatora: в режиме сравнения поля варианта B должны быть видны");
  hs = await state("stoimost-kvtch-akkumulyatora.html", { mode: "one" });
  check(["pb", "cb", "ub", "db", "nb", "eb", "lb"].every(id => hs.has(id)) && !hs.has("pa"), "stoimost-kvtch-akkumulyatora: в режиме одного аккумулятора поля B скрыты, поля A видны");
  hs = await state("kontroller-zaryada-mppt-pwm.html", {});
  check(["eta", "ovp", "pmax", "iscmax"].every(id => hs.has(id)), "kontroller-zaryada-mppt-pwm: в режиме PWM с основанием NEC поля MPPT и паспортного Isc скрыты");
  hs = await state("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", base: "own" });
  check(!hs.has("eta") && !hs.has("ovp") && !hs.has("iscmax") && hs.has("pmax"), "kontroller-zaryada-mppt-pwm: в режиме MPPT видны КПД, перегруз и паспортный Isc, мощность предела — только при своём пределе");
  hs = await state("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", ovp: "pmax" });
  check(!hs.has("pmax"), "kontroller-zaryada-mppt-pwm: при пределе мощности производителя поле мощности должно быть видно");
  hs = await state("vremya-raboty-ibp-peukert.html", {});
  check(!hs.has("k") && hs.has("c2") && hs.has("h2") && !hs.has("h"), "vremya-raboty-ibp-peukert: при заданном k вторая точка скрыта");
  hs = await state("vremya-raboty-ibp-peukert.html", { kmode: "two" });
  check(hs.has("k") && !hs.has("c2") && !hs.has("h2"), "vremya-raboty-ibp-peukert: в режиме двух точек поле k скрыто, вторая точка видна");
  hs = await state("vremya-raboty-ibp-peukert.html", { chem: "li" });
  check(["h", "kmode", "k", "c2", "h2"].every(id => hs.has(id)), "vremya-raboty-ibp-peukert: для Li-ion поля Пейкерта и H скрыты");
  hs = await state("samorazryad-akkumulyatora.html", { chem: "other" });
  check(hs.has("tref") && hs.has("temp"), "samorazryad-akkumulyatora: для других химий поля температуры скрыты");
  hs = await state("samorazryad-akkumulyatora.html", {});
  check(!hs.has("tref") && !hs.has("temp"), "samorazryad-akkumulyatora: для VRLA поля температуры видны");
}

// --- Партия №4: находки независимого проверяющего (эталоны посчитаны вручную, расчёт — в комментариях) ---
// MPPT: вход ограничен отдельно от выхода. Victron SmartSolar 250/60 — выход 60 А, Isc массива до 35 А.
// Isc 40 А: NEC по Morningstar выполнено (1,25·40 = 50 ≤ 60), но 40 > 35 — вывод «больше допустимого на входе».
await calculateWithout("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", isc: "40", vmp: "75", pw: "2775", umin: "48", umax: "57,6", irated: "60" }, ["1,25·Isc (NEC 690.8) и номинальный ток контроллера50 А ≤ 60 А", "Isc массива и предел на входе MPPT по паспорту40 А > 35 А", "СтатусТок КЗ массива больше допустимого на входе MPPT по паспорту контроллера: 40 А > 35 А"], ["СтатусОценка"]);
// Перегруз «при соблюдении предела Isc» не объявляется допустимым, если предел нарушен (3400·0,98/48 = 69,42 А > 60 А).
await calculateWithout("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", isc: "40", vmp: "90", pw: "3400", umin: "48", umax: "57,6", irated: "60", ovp: "isc" }, ["СтатусТок КЗ массива больше допустимого на входе MPPT по паспорту контроллера: 40 А > 35 А"], ["перегруз допускается"]);
// Граница предела входа: 35 = 35 — в пределах (ток на выходе 2500·0,98/48 = 51,04 А); 35,01 — уже нет.
await calculate("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", isc: "35", vmp: "75", pw: "2500", umin: "48", umax: "57,6", irated: "60" }, ["Isc массива и предел на входе MPPT по паспорту35 А ≤ 35 А", "СтатусОценка: условие по току КЗ выполнено, ток на выходе при STC 51,04 А не больше номинального 60 А"], "boundary");
await calculate("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", isc: "35,01", vmp: "75", pw: "2500", umin: "48", umax: "57,6", irated: "60" }, ["СтатусТок КЗ массива больше допустимого на входе MPPT по паспорту контроллера: 35,01 А > 35 А"], "boundary");
// Без паспортного предела входа у MPPT — «Недостаточно данных», даже если условие NEC выполнено.
await calculate("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", iscmax: "" }, ["Isc массива и предел на входе MPPT по паспортупредел не задан", "СтатусНедостаточно данных: для MPPT предел тока КЗ массива на входе задаёт паспорт контроллера — он не задан; условие 1,25·Isc по NEC в трактовке Morningstar выполнено"]);
// Запас Vmp у MPPT: Victron работает при превышении напряжения массива над АКБ не меньше 1 В. 15,4 − 14,4 = 1 В —
// риск; 15,41 В — оценка (ток на выходе 300·0,98/12 = 24,5 А).
await calculate("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", vmp: "15,4", pw: "300" }, ["СтатусРиск недозаряда: Vmp массива при STC выше наибольшего напряжения заряда только на 1 В"], "boundary");
await calculateWithout("kontroller-zaryada-mppt-pwm.html", { tip: "mppt", vmp: "15,41", pw: "300" }, ["СтатусОценка: условие по току КЗ выполнено, ток на выходе при STC 24,5 А не больше номинального 30 А"], ["Риск"], "boundary");
// PWM: верхняя оценка мощности в АКБ ограничена мощностью массива. При 18 В: Imp = 345/19 = 18,158 А,
// 18·18,158 = 326,8 Вт; 18·19,83 = 356,9 Вт > 345 → 345 Вт; доли 94,74…100 %.
await calculate("kontroller-zaryada-mppt-pwm.html", { umin: "18", umax: "18,2" }, ["Мощность в АКБ при 18 В — от U·Imp до U·Isc326,8…345 Вт из 345 Вт (94,74…100 %)", "СтатусОценка: условие по току КЗ выполнено; PWM передаст в АКБ около 94,74…100 % мощности массива при STC"]);
// Ток разряда сборки: температура вне паспорта не маскирует превышение — 3000/32,5 = 92,31 А > 80 А.
await calculate("tok-razryada-liion-sborki.html", { temp: "no", pl: "3000", ppk: "", tl: "" }, ["СтатусТок нагрузки 92,31 А больше допустимого длительного тока сборки 80 А по паспорту ячейки; к тому же температура ячеек вне паспортного диапазона", "не меньше 92,31 А длительно — больше допустимого тока ячеек"]);
// Замечание бота-ревьюера к PR #24 (не воспроизвелось, закреплено тестом): пик нагрузки задан, импульсного тока
// ячейки в паспорте нет — предел BMS только длительный, без «— А не дольше — с»: условие строки — паспортный
// импульс ячейки (ipl), а не пик нагрузки (ilp). 4000 Вт / 32,5 В = 123,1 А.
await calculateWithout("tok-razryada-liion-sborki.html", { ppk: "4000", tl: "10" }, ["Пиковый ток нагрузки123,1 А в течение 10 с", "Предел тока разряда в настройке BMSне выше 80 А длительно — по паспорту ячеек"], ["не дольше —", "— А", "NaN", "undefined"]);
// Режим C-rate при P = 4: 8C · 2,5 А·ч = 20 А на ячейку, 80 А на сборку (а не 320 А).
await calculate("tok-razryada-liion-sborki.html", { spec: "c", crc: "8", crp: "", tpk: "" }, ["Допустимый длительный ток сборки C-rate · C · P80 А"]);
// Балансировка: тепло E = U·ΔQ не зависит от доли времени D — 4,2·0,15 = 0,63 Вт·ч; время при D = 50 % вдвое больше:
// 0,15 / (4,2/65 · 0,5) = 4,643 ч.
await calculate("balansirovka-yacheek-bms.html", { duty: "50" }, ["Тепло в цепи балансировки E = U·ΔQ0,63 Вт·ч", "4,643 ч"]);
// Граница напряжения ячейки: 5 В — ещё Li-ion (5/65 = 76,92 мА), 5,01 В — ошибка.
await calculate("balansirovka-yacheek-bms.html", { u: "5" }, ["76,92 мА"], "boundary");
await invalid("balansirovka-yacheek-bms.html", { u: "5,01" }, "Напряжение ячейки при балансировке");
// Разные батареи важнее риска предохранителя: статус — «Недостаточно данных», а не «Риск срабатывания».
await calculateWithout("tok-vyravnivaniya-akb.html", { same: "diff", inf: "5" }, ["СтатусНедостаточно данных: батареи разные"], ["СтатусРиск срабатывания"]);
// Пейкерт по двум точкам: 100 А·ч / 20 ч = 5 А и 50 А·ч / 10 ч = 5 А — показатель не определить.
await invalid("vremya-raboty-ibp-peukert.html", { kmode: "two", c2: "50", h2: "10" }, "Токи разряда двух точек совпадают");
// Саморазряд: остаток не уходит ниже нуля — строка именно «0 %», а не «−50 %».
await calculate("samorazryad-akkumulyatora.html", { r: "5", temp: "20", m: "30" }, ["Заряд через 30 мес. — линейно, как у Panasonic0 %"]);

// ===========================================================================
// --- Партия №5, data_q.py ---
// «Силовая электроника»: диоды выпрямителя с конденсаторным фильтром,
// дроссельный LC-фильтр выпрямителя, ток пульсаций и срок службы
// электролита, трансформатор flyback. Ожидаемые значения посчитаны отдельными
// скриптами (scratchpad q/ref1–ref4.py, q/expect.py) с округлением как у
// toPrecision (половина — вверх), а не кодом страниц. Формулы там проверены
// другим путём: треугольный импульс тока — численным интегрированием,
// передача LC-фильтра — моделированием цепи по времени, срок службы — через
// эквивалентную температуру, индуктивность flyback — энергией за такт, зазор —
// магнитной цепью с AL. Расчёт — в комментариях.
// ===========================================================================

// --- 1. diody-vypryamitelya: Sedra/Smith, Petry (2012), паспорта Diodes Inc. и Rectron, Ametherm ---
// Эталон 1 (по умолчанию, мост): Vp = √2·12 − 2·1 = 14,97 В; ΔV = 1/(100·0,0047) = 2,128 В, минимум 12,84 В — при номинале.
// Токи импульса — при сети +10 % (третий отзыв бота): Vp = √2·12·1,1 − 2 = 16,67 В; θ = arccos(1 − 2,128/16,67) = 29,27°,
// tc = 0,5108/(2π·50) = 1,626 мс; треугольник: Iпик = 2·1·10/1,626 = 12,3 А; Iд = 0,5 А; Iд,RMS = 12,3·√(1,626/(3·20)) = 2,025 А;
// обмотка √2·2,025 = 2,864 А; IC = 12,3·√(3·1,626·(40 − 3·1,626))/60 = 2,683 А. При номинале было бы 11,64 / 1,97 / 2,786 / 2,6 А.
// Uобр = √2·12·1,1 = 18,67 В ≤ 1000 В; IF(AV) 3·(1 − 0,2) = 2,4 А. Сопротивлений нет — бросок не оценён.
await calculateWithout("diody-vypryamitelya.html", {}, ["Амплитуда на конденсаторе Vp = √2·U − 2·Vf14,97 В; при +10 % — 16,67 В", "Частота пульсаций100 Гц",
  "Размах пульсаций ΔV = I / (fп·C)2,128 В, наименьшее напряжение 12,84 В", "Угол проводимости θ = arccos(1 − ΔV/Vp) при +10 %29,27° — 1,626 мс из 10 мс",
  "Средний ток диода0,5 А", "Пиковый повторяющийся ток диода при +10 % — оценка12,3 А", "Действующий ток диода при +10 % — оценка2,025 А",
  "Действующий ток обмотки √2·Iд при +10 % — оценка2,864 А", "Ток пульсаций конденсатора (действующий) при +10 % — оценка2,683 А", "Токи импульса посчитаны при напряжении сети +10 %",
  "Напряжение на конденсаторе без нагрузки при +10 %18,67 В", "Обратное напряжение на диоде √2·U при +10 %18,67 В ≤ VRRM 1000 В",
  "Средний ток диода и допустимый по паспорту0,5 А ≤ 2,4 А (IF(AV) 3 А минус 20 %)", "Бросок при включениине оценён — нужны сопротивление обмоток, ESR или NTC",
  "СтатусНедостаточно данных: бросок при включении не оценён — нужны сопротивление обмоток, ESR или NTC", "Petry, 2012"],
  ["СтатусОценка", "Риск", "подмагничивает"]);
// Эталон 2 (пример на странице): Rобм 0,5 Ом + ESR 40 мОм = 0,54 Ом; бросок 18,676/0,54 = 34,57 А; τ = 0,54·0,0047 = 2,538 мс —
// не больше IFSM 200 А и короче 8,3 мс → «Оценка».
await calculateWithout("diody-vypryamitelya.html", { rw: "0,5", esr: "40" }, ["Наихудший бросок при включении √2·U·(1+δ) / R34,57 А при R = 0,54 Ом, τ = R·C = 2,538 мс; IFSM 200 А за 8,3 мс",
  "СтатусОценка: обратное напряжение, средний ток и наихудший бросок при включении не больше VRRM, IF(AV) и IFSM по паспорту", "включение на пике напряжения"], ["Риск", "Недостаточно"]);
// Рискованный вывод: тот же бросок для 1N4007 (IFSM 30 А, IO 1 А по паспорту Diodes Inc.) — только «Риск», не категоричный вердикт.
await calculateWithout("diody-vypryamitelya.html", { rw: "0,5", esr: "40", ifav: "1", ifsm: "30" }, ["0,5 А ≤ 0,8 А (IF(AV) 1 А минус 20 %)",
  "СтатусРиск перегрузки диодов при включении: наихудший бросок 34,57 А больше IFSM 30 А"], ["СтатусОценка", "Недостаточно"]);
// Однополупериодная схема: Vp = 16,97 − 1 = 15,97 В; ΔV = 1/(50·0,0047) = 4,255 В, минимум 11,72 В. Токи — при +10 %: Vp = 18,67 − 1 = 17,67 В;
// θ = arccos(1 − 4,255/17,67) = 40,61°, tc = 2,256 мс из 20; Iпик = 2·1·20/2,256 = 17,73 А; Iд = 1 А; Iд,RMS = 17,73·√(2,256/60) = 3,438 А = ток обмотки;
// IC = 17,73·√(3·2,256·(80 − 3·2,256))/120 = 3,289 А; Uобр = 2·√2·12·1,1 = 37,34 В.
await calculate("diody-vypryamitelya.html", { sch: "half" }, ["Амплитуда на конденсаторе Vp = √2·U − Vf15,97 В; при +10 % — 17,67 В", "Частота пульсаций50 Гц",
  "4,255 В, наименьшее напряжение 11,72 В", "40,61° — 2,256 мс из 20 мс", "Средний ток диода1 А", "Пиковый повторяющийся ток диода при +10 % — оценка17,73 А",
  "Действующий ток диода при +10 % — оценка3,438 А", "Действующий ток обмотки при +10 % — оценка3,438 А", "Ток пульсаций конденсатора (действующий) при +10 % — оценка3,289 А",
  "Обратное напряжение на диоде 2·√2·U при +10 %37,34 В ≤ VRRM 1000 В", "1 А ≤ 2,4 А", "подмагничивает сердечник"]);
// Со средней точкой: Vp = 15,97 В; ΔV = 2,128 В, минимум 13,84 В. Токи — при +10 %: Vp = 17,67 В; θ = arccos(1 − 2,128/17,67) = 28,41°, tc = 1,578 мс;
// Iпик = 20/1,578 = 12,67 А; Iд,RMS = 12,67·√(1,578/60) = 2,055 А — ток каждой половины обмотки; IC = 2,729 А; Uобр = 2·√2·12·1,1 = 37,34 В.
await calculate("diody-vypryamitelya.html", { sch: "ct" }, ["Амплитуда на конденсаторе Vp = √2·U − Vf15,97 В; при +10 % — 17,67 В", "2,128 В, наименьшее напряжение 13,84 В",
  "28,41° — 1,578 мс из 10 мс", "Средний ток диода0,5 А", "Пиковый повторяющийся ток диода при +10 % — оценка12,67 А", "Действующий ток диода при +10 % — оценка2,055 А",
  "Действующий ток каждой половины обмотки при +10 % — оценка2,055 А", "Ток пульсаций конденсатора (действующий) при +10 % — оценка2,729 А", "2·√2·U при +10 %37,34 В"]);
// Пульсации заданы (режим «задать»): ΔV = 2 В; токи при +10 %: θ = arccos(1 − 2/16,67) = 28,36°, tc = 1,575 мс; Iпик = 12,7 А; Iд,RMS = 2,057 А;
// обмотка 2,909 А; IC = 2,732 А. Ёмкость здесь — только для броска.
await calculate("diody-vypryamitelya.html", { rmode: "v", dv: "2" }, ["Размах пульсаций ΔV — задан2 В, наименьшее напряжение 12,97 В",
  "28,36° — 1,575 мс из 10 мс", "Пиковый повторяющийся ток диода при +10 % — оценка12,7 А", "Действующий ток диода при +10 % — оценка2,057 А",
  "Действующий ток обмотки √2·Iд при +10 % — оценка2,909 А", "Ток пульсаций конденсатора (действующий) при +10 % — оценка2,732 А"]);
// Граница области: ΔV = Vp/2 = 7,4853 В допустимо. При δ = 0 токи считаются при той же амплитуде: θ = 60°, tc = 1/300 с = 3,333 мс;
// Iпик = 0,02·300 = 6 А; Iд,RMS = 6·√(1/18) = 1,414 А; обмотка 2 А; IC = √(4 − 1) = 1,732 А. Чуть больше половины амплитуды — ошибка.
await calculate("diody-vypryamitelya.html", { rmode: "v", dv: "7,485281374238571", dup: "0" }, ["60° — 3,333 мс из 10 мс", "Пиковый повторяющийся ток диода — оценка6 А",
  "Действующий ток диода — оценка1,414 А", "Действующий ток обмотки √2·Iд — оценка2 А", "Ток пульсаций конденсатора (действующий) — оценка1,732 А"], "boundary");
await invalid("diody-vypryamitelya.html", { rmode: "v", dv: "7,49" }, "больше половины амплитуды");
await invalid("diody-vypryamitelya.html", { c: "1000" }, "больше половины амплитуды");
// Граница VRRM: Uобр = 18,6676 В. При VRRM 18,67 — «≤», число не округляется до порога; при 18,667 — однозначное превышение.
await calculate("diody-vypryamitelya.html", { vrrm: "18,67" }, ["Обратное напряжение на диоде √2·U при +10 %18,668 В ≤ VRRM 18,67 В"], "boundary");
// fx добавляет цифру и тогда, когда число и порог в четыре цифры записываются одинаково (18,67 и 18,67): 18,668 > 18,667.
await calculateWithout("diody-vypryamitelya.html", { vrrm: "18,667", rw: "0,5" }, ["СтатусОбратное напряжение на диоде 18,668 В больше VRRM 18,667 В"], ["Оценка", "Недостаточно"], "boundary");
// Граница IF(AV) с ёмкостной поправкой: мост, 47 000 мкФ, I = 4,8 А → Iд = 2,4 А = 3·0,8 — не больше; 4,81 А → 2,405 > 2,4.
await calculateWithout("diody-vypryamitelya.html", { il: "4,8", c: "47000" }, ["Средний ток диода и допустимый по паспорту2,4 А ≤ 2,4 А"], ["больше допустимого"], "boundary");
await calculate("diody-vypryamitelya.html", { il: "4,81", c: "47000" }, ["СтатусСредний ток диода 2,405 А больше допустимого по паспорту 2,4 А — IF(AV) с учётом снижения на 20 % для ёмкостной нагрузки"], "boundary");
// Поправка на ёмкостную нагрузку влияет на вывод: однополупериодная, IF(AV) 1 А — при 20 % допустимо 0,8 А (превышение), при 0 % — 1 А (не больше).
await calculate("diody-vypryamitelya.html", { sch: "half", ifav: "1" }, ["СтатусСредний ток диода 1 А больше допустимого по паспорту 0,8 А"]);
await calculateWithout("diody-vypryamitelya.html", { sch: "half", ifav: "1", der: "0" }, ["Средний ток диода и допустимый по паспорту1 А ≤ 1 А"], ["(IF(AV)", "больше допустимого"], "boundary");
// Граница IFSM: Rобм = 0,5 Ом → бросок 18,6676/0,5 = 37,335 А. IFSM ровно столько — «Оценка»; 37,33 А — «Риск».
await calculateWithout("diody-vypryamitelya.html", { rw: "0,5", ifsm: "37,335238046649714" }, ["СтатусОценка"], ["Риск"], "boundary");
await calculate("diody-vypryamitelya.html", { rw: "0,5", ifsm: "37,33" }, ["СтатусРиск перегрузки диодов при включении: наихудший бросок 37,34 А больше IFSM 37,33 А"], "boundary");
// Граница длительности: τ = 0,5·0,0047 = 2,35 мс. При импульсе IFSM 2,35 мс — «Оценка», при 2,34 мс — бросок затянут.
await calculateWithout("diody-vypryamitelya.html", { rw: "0,5", tfsm: "2,35" }, ["СтатусОценка"], ["затянут"], "boundary");
await calculate("diody-vypryamitelya.html", { rw: "0,5", tfsm: "2,34" }, ["СтатусНедостаточно данных: бросок затянут: τ = 2,35 мс больше длительности импульса IFSM 2,34 мс"], "boundary");
// Затянутый бросок: 47 000 мкФ, сопротивление обмоток 5 Ом → 18,6676/5 = 3,734 А, τ = 5·0,047 = 235 мс ≫ 8,3 мс — по графику паспорта.
await calculate("diody-vypryamitelya.html", { c: "47000", rw: "5" }, ["3,734 А при R = 5 Ом, τ = R·C = 235 мс", "СтатусНедостаточно данных: бросок затянут: τ = 235 мс больше длительности импульса IFSM 8,3 мс"]);
// Проверка партии (P2): NTC ограничивает бросок, только пока холодный. С холодным 5 Ом первое включение — 3,734 А,
// а повторное с горячим термистором без его паспортного сопротивления и без сопротивления обмоток не оценить.
await calculate("diody-vypryamitelya.html", { c: "47000", ntc: "5" }, ["Бросок при первом включении — холодный термистор: √2·U·(1+δ) / R3,734 А при R = 5 Ом", "Бросок при повторном включении с горячим термисторомне оценён", "СтатусНедостаточно данных: бросок при повторном включении с горячим термистором не оценён"]);
// Пример проверяющего: 12 В, 0,3 А, 2200 мкФ, NTC 3 Ом холодный и 0,2 Ом горячий, IFSM 30 А, IF(AV) 1 А:
// первое включение 18,6676/3 = 6,223 А, повторное 18,6676/0,2 = 93,34 А > 30 А — «Риск», а не «Оценка».
await calculate("diody-vypryamitelya.html", { il: "0,3", c: "2200", ifav: "1", ifsm: "30", ntc: "3", ntch: "0,2" }, ["6,223 А при R = 3 Ом", "СтатусРиск перегрузки диодов при повторном включении: с горячим термистором бросок 93,34 А больше IFSM 30 А"]);
// Обмотки 0,5 Ом, NTC 5 Ом холодный и 0,5 Ом горячий: 18,67/5,5 = 3,394 А и 18,67/1 = 18,67 А, τ = 1·0,0047 = 4,7 мс — «Оценка».
await calculate("diody-vypryamitelya.html", { rw: "0,5", ntc: "5", ntch: "0,5" }, ["3,394 А при R = 5,5 Ом", "Наихудший бросок — повторное включение с горячим термистором18,67 А при R = 1 Ом, τ = R·C = 4,7 мс", "СтатусОценка"]);
await invalid("diody-vypryamitelya.html", { ntch: "1" }, "Сопротивление термистора в горячем состоянии задаётся вместе с холодным.");
await invalid("diody-vypryamitelya.html", { ntc: "1", ntch: "2" }, "Сопротивление термистора в горячем состоянии не может быть больше, чем в холодном.");
await invalid("diody-vypryamitelya.html", { ntc: "5", ntch: "x" }, "Сопротивление термистора в горячем состоянии — число в омах.");
await invalid("diody-vypryamitelya.html", { ntc: "5", ntch: "-1" }, "Сопротивление термистора в горячем состоянии не может быть отрицательным.");
// Частота сети и превышение напряжения входят в расчёт (мутации проверяющего M01, M02): 60 Гц — при +10 % 1,235 мс из 8,333 мс,
// пик 13,5 А, ток конденсатора 2,828 А; δ = 5 % — 12·√2·1,05 = 17,82 В.
await calculate("diody-vypryamitelya.html", { f: "60" }, ["Угол проводимости θ = arccos(1 − ΔV/Vp) при +10 %26,67° — 1,235 мс из 8,333 мс", "Пиковый повторяющийся ток диода при +10 % — оценка13,5 А", "Ток пульсаций конденсатора (действующий) при +10 % — оценка2,828 А"]);
await calculate("diody-vypryamitelya.html", { dup: "5" }, ["Напряжение на конденсаторе без нагрузки при +5 %17,82 В", "Обратное напряжение на диоде √2·U при +5 %17,82 В"]);
// Без паспортных пределов — «Недостаточно данных», а не молчаливое «выполняется»; бросок 37,34 А, τ = 2,35 мс показан справочно.
await calculateWithout("diody-vypryamitelya.html", { vrrm: "", ifav: "", ifsm: "", tfsm: "", rw: "0,5" }, ["18,67 В — VRRM не задано", "0,5 А — IF(AV) не задан",
  "37,34 А при R = 0,5 Ом, τ = R·C = 2,35 мс", "СтатусНедостаточно данных: нет паспортных значений VRRM, IF(AV), IFSM"], ["Оценка", "≤ VRRM"]);
// Пульсации заданы, ёмкость не задана: длительность броска неизвестна — «Недостаточно данных».
await calculateWithout("diody-vypryamitelya.html", { rmode: "v", c: "", rw: "0,5" }, ["37,34 А при R = 0,5 Ом; IFSM 200 А за 8,3 мс", "СтатусНедостаточно данных: длительность броска не оценена — нужна ёмкость"], ["τ =", "Оценка"]);
await invalid("diody-vypryamitelya.html", { us: "12 В" }, "Заполните числами");
await invalid("diody-vypryamitelya.html", { us: "0" }, "Напряжение обмотки — больше 0");
await invalid("diody-vypryamitelya.html", { dup: "51" }, "Превышение напряжения задаётся от 0 до 50 %");
await invalid("diody-vypryamitelya.html", { f: "5" }, "Частота сети — от 10 до 1000 Гц");
await invalid("diody-vypryamitelya.html", { il: "0" }, "Ток нагрузки должен быть больше нуля");
await invalid("diody-vypryamitelya.html", { vf: "6" }, "Прямое падение на диоде — от 0 до 5 В");
await invalid("diody-vypryamitelya.html", { der: "100" }, "Снижение тока при ёмкостной нагрузке");
await invalid("diody-vypryamitelya.html", { c: "abc" }, "Ёмкость — число в микрофарадах");
await invalid("diody-vypryamitelya.html", { c: "" }, "Введите ёмкость фильтра");
await invalid("diody-vypryamitelya.html", { c: "0" }, "Ёмкость должна быть больше нуля");
await invalid("diody-vypryamitelya.html", { vrrm: "abc" }, "VRRM — число в вольтах");
await invalid("diody-vypryamitelya.html", { ifav: "0" }, "IF(AV) должен быть больше нуля");
await invalid("diody-vypryamitelya.html", { tfsm: "" }, "Для IFSM задайте длительность импульса");
await invalid("diody-vypryamitelya.html", { rw: "-1" }, "Сопротивление обмоток не может быть отрицательным");
await invalid("diody-vypryamitelya.html", { esr: "abc" }, "ESR — число в миллиомах");
await invalid("diody-vypryamitelya.html", { ntc: "-2" }, "Сопротивление термистора не может быть отрицательным");
await invalid("diody-vypryamitelya.html", { rmode: "v", dv: "abc" }, "Введите размах пульсаций");
await invalid("diody-vypryamitelya.html", { us: "1", vf: "1" }, "Падение на диодах не меньше амплитуды");

// --- 2. drosselnyy-filtr-vypryamitelya: ряд Фурье, Radiotron/ARRL/QST — Lкр ≈ R/(3ω), комплексный делитель ---
// Эталон 1 (по умолчанию): мост 24 В, 50 Гц, 2 А, 20 мГн, 4700 мкФ, сеть +10 %. Vd0 = 2·33,941/π = 21,61 В; Vdc = 21,61 − 2 = 19,61 В;
// V2 = 4·33,941/(3π) = 14,41 В; f0 = 1/(2π√(0,02·0,0047)) = 16,42 Гц, 100/16,42 = 6,092; Rн = 9,804 Ом;
// |1 − (628,3)²·0,02·0,0047 + j·628,3·0,02/9,804| = 36,13 → 0,02768; размах 2·14,41·0,02768 = 0,7973 В, 0,3987/(√2·19,61) = 1,438 %.
// Проверка партии (P2): переменный ток дросселя — через полное сопротивление дросселя и конденсатора с нагрузкой:
// 14,41/|j·12,566 + 1/(j·628,3·0,0047 + 1/9,804)| = 1,178 А; без конденсатора 14,41/12,566 = 1,146 А; Lкр при 2 А — 12 мГн (11,46).
// Восьмой отзыв бота (P2): непрерывность — и при сети +δ с тем же током нагрузки. Независимый эталон ref_choke3.py
// (комплексные числа Python, Lкр делением отрезка по L, Iкр простой итерацией): V2·1,1 = 15,85 В, Vd0·1,1 − 2 = 21,77 В,
// Rн = 10,88 Ом → 1,296 А, Lкр 13,15 мГн, наименьший ток 1,296 А, пик 3,296 А. Нагрузочный резистор — по номиналу:
// 19,61/1,178 = 16,64 Ом, 23,1 Вт; при сети +10 % он рассеивает 21,77²/16,64 = 28,47 Вт. Без нагрузки √2·24·1,1 = 37,34 В.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", {}, ["Постоянная составляющая выпрямленного напряжения 2√2·U/π21,61 В",
  "Напряжение на нагрузке за вычетом двух диодов19,61 В — сопротивление дросселя и обмоток не задано", "Пульсации на входе фильтра: амплитуда гармоники 2f, 4√2·U/(3π)14,41 В на 100 Гц",
  "Резонансная частота f0 = 1/(2π√(LC))16,42 Гц — частота пульсаций выше в 6,092 раза", "Коэффициент передачи пульсаций 1/|1 − (2ω)²LC + j·2ωL/R|0,02768",
  "Пульсации на выходе — размах по первой гармонике0,7973 В (1,438 % действующего от постоянного)",
  "Переменный ток дросселя на 2f: V2 / |j·2ωL + Zc∥Rн|1,178 А при номинале, 1,296 А при сети +10 %; без учёта конденсатора V2/(2ωL) — 1,146 А",
  "Критическая индуктивность при токе 2 А с учётом конденсатора и нагрузки12 мГн при номинале, 13,15 мГн при сети +10 %, задано 20 мГн; без конденсатора 2√2·U/(3π·ω·I) ≈ Rн/(3ω) — 11,46 мГн",
  "Наименьший ток непрерывного режима при этой L1,178 А при номинале, 1,296 А при сети +10 %", "Пиковый ток дросселя I + Iперем3,178 А при номинале, 3,296 А при сети +10 %",
  "Нагрузочный резистор, чтобы ток не прерывался без нагрузкине больше 16,64 Ом — рассеивает 23,1 Вт, при сети +10 % — 28,47 Вт", "Без нагрузки напряжение растёт до пикового √2·U·(1 + δ)37,34 В",
  "Обратное напряжение на диоде √2·U·(1 + δ)37,34 В", "СтатусОценка: ток дросселя непрерывный при номинале и при сети +10 %, на нагрузке около 19,61 В, пульсации около 0,7973 В размаха",
  "Вывод о непрерывности — по худшему из двух", "Нагрузочный резистор подобран по номинальной сети: для резистора это худший случай"],
  ["прерывистый", "не ослабляет"]);
// Номинальная сеть (δ = 0): одно значение в строке, без пометок «при номинале» и «при сети +δ»; без нагрузки 33,94 В.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { dup: "0" }, ["Переменный ток дросселя на 2f: V2 / |j·2ωL + Zc∥Rн|1,178 А; без учёта конденсатора V2/(2ωL) — 1,146 А",
  "Критическая индуктивность при токе 2 А с учётом конденсатора и нагрузки12 мГн, задано 20 мГн; без конденсатора 2√2·U/(3π·ω·I) ≈ Rн/(3ω) — 11,46 мГн",
  "Наименьший ток непрерывного режима при этой L1,178 А", "Пиковый ток дросселя I + Iперем3,178 А",
  "Нагрузочный резистор, чтобы ток не прерывался без нагрузкине больше 16,64 Ом — рассеивает 23,1 Вт", "Без нагрузки напряжение растёт до пикового √2·U·(1 + δ)33,94 В",
  "СтатусОценка: ток дросселя непрерывный, на нагрузке около 19,61 В, пульсации около 0,7973 В размаха"], ["при номинале", "при сети +", "по худшему из двух"]);
// Ток ниже наименьшего тока непрерывного режима при номинале: 0,5 А < 1,178 А — прерывистый, напряжение растёт к пиковому
// 33,94 − 2 = 31,94 В; Lкр при 0,5 А с конденсатором — 46,39 мГн (без конденсатора 45,85), при сети +10 % — 50,98 мГн.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { il: "0,5" }, ["Критическая индуктивность при токе 0,5 А с учётом конденсатора и нагрузки46,39 мГн при номинале, 50,98 мГн при сети +10 %, задано 20 мГн; без конденсатора 2√2·U/(3π·ω·I) ≈ Rн/(3ω) — 45,85 мГн",
  "Пульсации на выходе — размах по первой гармоникене оцениваются: ток дросселя прерывистый",
  "СтатусТок дросселя прерывистый: ток нагрузки 0,5 А меньше наименьшего тока непрерывного режима 1,178 А — напряжение выше 19,61 В и с уменьшением нагрузки растёт к пиковому 31,94 В"], ["Оценка", "при этой сети"]);
// Малая ёмкость 470 мкФ: f0 = 51,91 Гц, передача 0,3335, размах 9,607 В (17,32 %) — моделированием 0,3337. Конденсатор заметно
// добавляет переменного тока: 1,501 А против 1,146 А без него; наименьший ток 1,526 А; резистор 12,85 Ом, 29,93 Вт.
// При сети +10 % (ref_choke3.py): 1,663 А, Lкр 17,43 мГн, наименьший ток 1,68 А, пик 3,663 А; резистор рассеивает 36,89 Вт.
await calculate("drosselnyy-filtr-vypryamitelya.html", { c: "470" }, ["Резонансная частота f0 = 1/(2π√(LC))51,91 Гц — частота пульсаций выше в 1,926 раза",
  "2ωL/R|0,3335", "9,607 В (17,32 % действующего от постоянного)", "Переменный ток дросселя на 2f: V2 / |j·2ωL + Zc∥Rн|1,501 А при номинале, 1,663 А при сети +10 %",
  "16,16 мГн при номинале, 17,43 мГн при сети +10 %", "Наименьший ток непрерывного режима при этой L1,526 А при номинале, 1,68 А при сети +10 %",
  "Пиковый ток дросселя I + Iперем3,501 А при номинале, 3,663 А при сети +10 %", "не больше 12,85 Ом — рассеивает 29,93 Вт, при сети +10 % — 36,89 Вт"]);
// Со средней точкой: один диод в цепи — 21,61 − 1 = 20,61 В; Rн = 10,3 Ом → 0,7974 В (1,368 %); резистор 20,61/1,178 = 17,49 Ом, 24,28 Вт,
// при сети +10 % — 22,77²/17,49 = 29,63 Вт; Uобр = 2·37,34 = 74,67 В.
await calculate("drosselnyy-filtr-vypryamitelya.html", { sch: "ct" }, ["Напряжение на нагрузке за вычетом диода20,61 В", "0,7974 В (1,368 % действующего от постоянного)",
  "не больше 17,49 Ом — рассеивает 24,28 Вт, при сети +10 % — 29,63 Вт", "Обратное напряжение на диоде 2·√2·U·(1 + δ)74,67 В"]);
// Сопротивление дросселя и обмоток 0,5 Ом: 21,61 − 2 − 2·0,5 = 18,61 В; Rн = 9,304 Ом. Проверка Codex (P2): r стоит последовательно с L
// и для переменного тока — |Zp/(r + j·2ωL + Zp)| = 0,02765 → 1,514 %; резистор при наименьшем токе 16,16 Ом, 22,39 Вт.
// При сети +10 %: переменный ток 1,295 А, Lкр 13,12 мГн, наименьший ток 1,295 А; резистор 16,16 Ом на 21,77·16,16/16,66 В — 27,59 Вт.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { rdc: "0,5" }, ["Напряжение на нагрузке за вычетом двух диодов и падения I·R18,61 В", "1,514 % действующего от постоянного",
  "Коэффициент передачи пульсаций 1/|1 + r/R − (2ω)²LC + j·2ω(L/R + rC)|0,02765", "Переменный ток дросселя на 2f: V2 / |r + j·2ωL + Zc∥Rн|1,177 А при номинале, 1,295 А при сети +10 %",
  "11,97 мГн при номинале, 13,12 мГн при сети +10 %", "Наименьший ток непрерывного режима при этой L1,177 А при номинале, 1,295 А при сети +10 %",
  "не больше 16,16 Ом — рассеивает 22,39 Вт, при сети +10 % — 27,59 Вт"], ["не задано"]);
// У резонанса сопротивление заметно демпфирует: 470 мкФ и r = 1 Ом — передача 0,3208 вместо 0,3335, размах 9,244 В (18,56 %);
// при номинале 1,462 А и наименьший ток 1,499 А, при сети +10 % — 1,625 и 1,649 А; резистор 12,08 Ом, 27,14 Вт, при +10 % — 33,45 Вт.
await calculate("drosselnyy-filtr-vypryamitelya.html", { c: "470", rdc: "1" }, ["Коэффициент передачи пульсаций 1/|1 + r/R − (2ω)²LC + j·2ω(L/R + rC)|0,3208", "9,244 В (18,56 % действующего от постоянного)",
  "Переменный ток дросселя на 2f: V2 / |r + j·2ωL + Zc∥Rн|1,462 А при номинале, 1,625 А при сети +10 %", "15,64 мГн при номинале, 17,01 мГн при сети +10 %",
  "Наименьший ток непрерывного режима при этой L1,499 А при номинале, 1,649 А при сети +10 %", "не больше 12,08 Ом — рассеивает 27,14 Вт, при сети +10 % — 33,45 Вт"]);
// Резонанс на частоте пульсаций: 11,5 мГн и 220 мкФ → f0 = 100,1 Гц; |1 − (100/100,06)² + j·628,3·0,0115/9,804| = 0,7369 → 1,357 > 1.
// Ток при этом непрерывный (Iкр = 1,994 А < 2 А), но вывод — «не ослабляет», он важнее.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { l: "11,5", c: "220" }, ["Резонансная частота f0 = 1/(2π√(LC))100,1 Гц — выше частоты пульсаций 100 Гц", "СтатусФильтр не ослабляет пульсации: коэффициент передачи 1,357 — резонансная частота 100,1 Гц не ниже частоты пульсаций 100 Гц"], ["Оценка", "выше в"]);
// Интеграция: резонанс заметно выше 2f — 1 мГн и 100 мкФ → f0 = 1/(2π·√(10⁻⁷)) = 503,29 Гц;
// |1 − 628,32²·10⁻⁷ + j·0,62832/9,8041| = |0,96052 + j·0,064088| = 0,96266 → передача 1,0388 — не «близка», а выше 2f.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { l: "1", c: "100" }, ["Резонансная частота f0 = 1/(2π√(LC))503,3 Гц — выше частоты пульсаций 100 Гц", "СтатусФильтр не ослабляет пульсации: коэффициент передачи 1,039 — резонансная частота 503,3 Гц не ниже частоты пульсаций 100 Гц"], ["слишком близка", "выше в 0"]);
// Резонанс ниже 2f, но близко: 20 мГн, 180 мкФ, 0,5 А → f0 = 1/(2π·√(3,6·10⁻⁶)) = 83,882 Гц, (2f/f0)² = 1,42122;
// R = 19,6076/0,5 = 39,215 Ом, 2ωL/R = 0,32045; |1 − 1,42122 + j·0,32045| = 0,52925 → передача 1,8894 — «слишком близка».
// Токи (ref_choke3.py): 3,155 А при номинале, 3,581 А при +10 %; наименьший ток 1,738 и 1,918 А; резистор 11,28 Ом, 34,08 и 42,01 Вт.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { c: "180", il: "0,5" }, ["Резонансная частота f0 = 1/(2π√(LC))83,88 Гц — частота пульсаций выше в 1,192 раза", "СтатусФильтр не ослабляет пульсации: коэффициент передачи 1,889 — резонансная частота 83,88 Гц слишком близка к частоте пульсаций 100 Гц",
  "3,155 А при номинале, 3,581 А при сети +10 %", "Наименьший ток непрерывного режима при этой L1,738 А при номинале, 1,918 А при сети +10 %", "не больше 11,28 Ом — рассеивает 34,08 Вт, при сети +10 % — 42,01 Вт"], ["не ниже частоты"]);
// И при прерывистом токе усиление пульсаций показывается первым: 10 мГн, 253 мкФ, 0,5 А → передача 6,241.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { l: "10", c: "253", il: "0,5" }, ["СтатусФильтр не ослабляет пульсации: коэффициент передачи 6,241"], ["СтатусТок дросселя прерывистый"]);
// Граница при сети +10 % — неподвижная точка 1,295855364108666 А (простая итерация в Python): ровно столько — непрерывный ток
// и там; 1,295 А — прерывистый только при +10 %, при номинале ток непрерывный.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { il: "1,295855364108666" }, ["СтатусОценка: ток дросселя непрерывный при номинале и при сети +10 %"], ["прерывистый"], "boundary");
await calculate("drosselnyy-filtr-vypryamitelya.html", { il: "1,295" }, ["СтатусТок дросселя прерывистый при сети +10 %: ток нагрузки 1,295 А меньше наименьшего тока непрерывного режима при этой сети 1,296 А, при номинале ток непрерывный"], "boundary");
// Граница при номинале — 1,17805008 А. Ровно столько — при номинале непрерывный, вывод — прерывистый при +10 %; 1,178 А — прерывистый
// уже при номинале, наименьший ток показан с точностью, не округляющей его до тока нагрузки. При δ = 0 граница та же.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { il: "1,1780500808038312" }, ["СтатусТок дросселя прерывистый при сети +10 %:", "при номинале ток непрерывный",
  "Пульсации на выходе — размах по первой гармонике0,7977 В"], ["не оцениваются"], "boundary");
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { il: "1,178" }, ["СтатусТок дросселя прерывистый: ток нагрузки 1,178 А меньше наименьшего тока непрерывного режима 1,1781 А",
  "Наименьший ток непрерывного режима при этой L1,1781 А при номинале, 1,296 А при сети +10 %"], ["при этой сети"], "boundary");
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { il: "1,1780500808038312", dup: "0" }, ["СтатусОценка: ток дросселя непрерывный"], ["прерывистый"], "boundary");
await calculate("drosselnyy-filtr-vypryamitelya.html", { il: "1,178", dup: "0" }, ["СтатусТок дросселя прерывистый: ток нагрузки 1,178 А меньше наименьшего тока непрерывного режима 1,1781 А"], "boundary");
// Пример бота-ревьюера: 1,25 А при сети +10 %. Номинальная граница 1,178 А обещала непрерывный ток, но при +10 % наименьший ток
// 1,296 А: Lкр 20,71 мГн больше заданных 20; пик 2,546 А. Моделирование во времени (мост, LC, источник тока, все гармоники,
// установившийся режим стрельбой): наименьший ток дросселя +0,081 А при номинале и −0,035 А при +10 %; граница 1,1685 и 1,2854 А.
// Пульсации при номинале оцениваются — там ток непрерывный.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { il: "1,25" }, ["СтатусТок дросселя прерывистый при сети +10 %: ток нагрузки 1,25 А меньше наименьшего тока непрерывного режима при этой сети 1,296 А, при номинале ток непрерывный. При сети +10 % напряжение выше 21,77 В и с уменьшением нагрузки растёт к пиковому 35,34 В",
  "18,88 мГн при номинале, 20,71 мГн при сети +10 %, задано 20 мГн", "Пиковый ток дросселя I + Iперем2,428 А при номинале, 2,546 А при сети +10 %", "Пульсации на выходе — размах по первой гармонике0,7977 В"], ["Оценка", "не оцениваются"]);
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { il: "1,25", dup: "0" }, ["СтатусОценка: ток дросселя непрерывный"], ["прерывистый"]);
// С сопротивлением дросселя напряжение прерывистого режима при +10 % — за вычетом I·r: 21,77 − 1,25·0,5 = 21,14 В.
await calculate("drosselnyy-filtr-vypryamitelya.html", { il: "1,25", rdc: "0,5" }, ["наименьшего тока непрерывного режима при этой сети 1,295 А, при номинале ток непрерывный. При сети +10 % напряжение выше 21,14 В и с уменьшением нагрузки растёт к пиковому 35,34 В"]);
// Большое сопротивление обмоток при сети +50 %: 1 мГн, r = 5 Ом. Неподвижная точка при +50 % — 4,269 А, выше v0/r = 3,922 А
// (при номинале там падение на r съело бы напряжение), но ниже 30,41/5 = 6,082 А: поиск при +δ идёт до своего предела.
// При номинале 2,843 А; резистор (19,61 − 2,843·5)/2,843 = 1,898 Ом, 15,33 Вт, при +50 % — (30,41·1,898/6,898)²/1,898 = 36,89 Вт.
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { dup: "50", l: "1", rdc: "5" }, ["Наименьший ток непрерывного режима при этой L2,843 А при номинале, 4,269 А при сети +50 %",
  "не больше 1,898 Ом — рассеивает 15,33 Вт, при сети +50 % — 36,89 Вт", "Пиковый ток дросселя I + Iперем4,863 А при номинале, 6,305 А при сети +50 %",
  "СтатусТок дросселя прерывистый: ток нагрузки 2 А меньше наименьшего тока непрерывного режима 2,843 А — напряжение выше 9,608 В"], ["не достигается"]);
// Неподвижная точка только при +δ: 10 В, Vf = 2 В, 1 мГн, r = 2 Ом, +50 %. При номинале V2 = 6,002 В больше V0 = 5,003 В, и переменный ток
// остаётся выше постоянного вплоть до V0/r — точки нет; при +50 % V2 = 9,003 В < V0 = 9,505 В — 4,061 А (ref_choke3.py).
await calculateWithout("drosselnyy-filtr-vypryamitelya.html", { us: "10", vf: "2", dup: "50", l: "1", rdc: "2", il: "1" }, ["Наименьший ток непрерывного режима при этой Lне достигается при номинале, 4,061 А при сети +50 %",
  "Нагрузочный резистор, чтобы ток не прерывался без нагрузкине оценивается", "2,915 А при номинале, 4,422 А при сети +50 %",
  "СтатусТок дросселя прерывистый: ток нагрузки 1 А меньше переменного тока дросселя 2,915 А — напряжение выше 3,003 В и с уменьшением нагрузки растёт к пиковому 10,14 В"], ["съедает"]);
// Пример проверяющего (моделирование во времени): 520 мкФ, 1,3 А — ток прерывистый уже при номинале (наименьший ток 1,487 А),
// хотя классическая оценка (1,146 А) обещала непрерывный; при +10 % — 1,636 А.
await calculate("drosselnyy-filtr-vypryamitelya.html", { c: "520", il: "1,3" }, ["СтатусТок дросселя прерывистый: ток нагрузки 1,3 А меньше наименьшего тока непрерывного режима 1,487 А",
  "Наименьший ток непрерывного режима при этой L1,487 А при номинале, 1,636 А при сети +10 %"]);
// 4700 мкФ и 1,16 А — тоже прерывистый при номинале (классика давала 1,146 А, моделирование — около 1,17 А).
await calculate("drosselnyy-filtr-vypryamitelya.html", { il: "1,16" }, ["СтатусТок дросселя прерывистый: ток нагрузки 1,16 А меньше наименьшего тока непрерывного режима 1,178 А"]);
// Частота сети входит в расчёт (мутация проверяющего M04): 60 Гц — переменный ток 0,9735 А, передача 0,01906, резистор 20,14 Ом,
// 19,09 Вт; при сети +10 % — 1,071 А и 23,53 Вт (ref_choke3.py).
await calculate("drosselnyy-filtr-vypryamitelya.html", { f: "60" }, ["Переменный ток дросселя на 2f: V2 / |j·2ωL + Zc∥Rн|0,9735 А при номинале, 1,071 А при сети +10 %",
  "Наименьший ток непрерывного режима при этой L0,9735 А при номинале, 1,071 А при сети +10 %",
  "Коэффициент передачи пульсаций 1/|1 − (2ω)²LC + j·2ωL/R|0,01906", "не больше 20,14 Ом — рассеивает 19,09 Вт, при сети +10 % — 23,53 Вт"]);
await invalid("drosselnyy-filtr-vypryamitelya.html", { us: "abc" }, "Заполните числами");
await invalid("drosselnyy-filtr-vypryamitelya.html", { f: "5" }, "Частота сети — от 10 до 1000 Гц");
await invalid("drosselnyy-filtr-vypryamitelya.html", { dup: "-1" }, "Превышение напряжения задаётся от 0 до 50 %");
await invalid("drosselnyy-filtr-vypryamitelya.html", { vf: "6" }, "Прямое падение на диоде — от 0 до 5 В");
await invalid("drosselnyy-filtr-vypryamitelya.html", { il: "0" }, "Ток нагрузки должен быть больше нуля");
await invalid("drosselnyy-filtr-vypryamitelya.html", { l: "0" }, "Индуктивность и ёмкость должны быть больше нуля");
await invalid("drosselnyy-filtr-vypryamitelya.html", { c: "-1" }, "Индуктивность и ёмкость должны быть больше нуля");
await invalid("drosselnyy-filtr-vypryamitelya.html", { rdc: "x" }, "Сопротивление дросселя и обмоток — число");
await invalid("drosselnyy-filtr-vypryamitelya.html", { rdc: "-1" }, "Сопротивление не может быть отрицательным");
await invalid("drosselnyy-filtr-vypryamitelya.html", { us: "1", vf: "1" }, "Падения на диодах и сопротивлении не меньше");

// --- 3. transformator-flyback: Fairchild AN-4137, TI SLUP127, паспорта TDK E 25/13/7 и N87 ---
// Эталон 1 (по умолчанию): Pвх = 24/0,85 = 28,24 Вт; n = 75/12,5 = 6; D = 75/175 = 0,4286; Lp = (42,857)²/(2·28,24·65 000) = 500,4 мкГн;
// проверка энергией: ½·500,4 мкГн·1,3176²·65 000 = 28,24 Вт. Iпик = 2·28,24/42,857 = 1,318 А; IRMS = 1,318·√(0,4286/3) = 0,498 А;
// Np ≥ 500,4e-6·1,3176/(0,3·52,5e-6) = 41,86 → Ns = ⌈41,86/6⌉ = 7, Np = 42; B = 6,593e-4/(42·52,5e-6) = 0,299 Тл;
// зазор μ0·52,5e-6·(1764/500,4e-6 − 1/1850e-9) = 0,1969 мм (проверка: μ0·N²·Ae/(g + μ0·Ae/AL) = Lp);
// ключ 375 + 75 = 450 В — 69,23 % от 650 В; диод 12 + 375/6 = 74,5 В; вторичная 6·1,3176 = 7,906 А.
await calculateWithout("transformator-flyback.html", {}, ["Входная мощность Pвых / η28,24 Вт", "Коэффициент трансформации n = Vor / (Vвых + VF)6",
  "Наибольший коэффициент заполнения Dmax = Vor / (Vor + Vвх min)0,4286", "(Vвх min·Dmax)² / (2·Pвх·fs)не больше 500,4 мкГн",
  "Пиковый ток первичной обмотки 2·Pвх / (Vвх min·Dmax)1,318 А", "Действующий ток первичной обмотки Iпик·√(Dmax/3)0,498 А",
  "Наименьшее число витков Lp·I / (Bmax·Ae)41,86 — по пиковому току", "Витки первичной / вторичной обмотки42 / 7 — n = 6, Vor = 75 В",
  "Индукция при пиковом токе Lp·Iпик / (Np·Ae)0,299 Тл", "μ0·Ae·(Np²/Lp − 1/AL)0,1969 мм", "Напряжение на ключе Vвх max + Vor без выброса450 В — 69,23 % от VDSS 650 В",
  "Обратное напряжение на выходном диоде Vвых + Vвх max / n74,5 В", "Пиковый ток вторичной обмотки n·Iпик7,906 А",
  "СтатусОценка: Lp не больше 500,4 мкГн, 42 / 7 витков, зазор около 0,1969 мм без учёта выпучивания; напряжение на ключе без выброса 450 В — 69,23 % от VDSS; насыщение при токе ограничения контроллера не проверено — порог не задан",
  "Выброс напряжения от индуктивности рассеяния здесь не считается", "IEC 62368-1"], ["Риск", "Недостаточно", "Индукция при токе ограничения"]);
// Порог ограничения тока 1,5 А (AN-4137 считает витки по нему): Np ≥ 500,4e-6·1,5/(0,3·52,5e-6) = 47,66 → Ns = 8, Np = 48;
// B при 1,318 А — 0,2616 Тл, при 1,5 А — 0,2979 Тл; зазор μ0·52,5e-6·(2304/500,4e-6 − 1/1850e-9) = 0,2681 мм.
await calculateWithout("transformator-flyback.html", { ilim: "1,5" }, ["47,66 — по порогу ограничения тока 1,5 А", "48 / 8 — n = 6, Vor = 75 В", "0,2616 Тл",
  "Индукция при токе ограничения0,2979 Тл", "0,2681 мм", "СтатусОценка: Lp не больше 500,4 мкГн, 48 / 8 витков"], ["не проверено"]);
// Порог ниже пикового тока: мощность при наименьшем входном напряжении не будет отдана — однозначный вывод.
await calculate("transformator-flyback.html", { ilim: "1,2" }, ["СтатусПиковый ток 1,318 А больше порога ограничения тока 1,2 А — при наименьшем входном напряжении заданная мощность не будет отдана"]);
// Граница порога: ровно Iпик = 1,3176471 А — витки по порогу, вывода нет; 1,3176 А — меньше пикового.
await calculateWithout("transformator-flyback.html", { ilim: "1,3176470588235292" }, ["по порогу ограничения тока", "42 / 7"], ["СтатусПиковый ток"], "boundary");
await calculate("transformator-flyback.html", { ilim: "1,3176" }, ["СтатусПиковый ток 1,31765 А больше порога ограничения тока 1,3176 А"], "boundary");
// VDSS 400 В меньше 450 В — превышение даже без выброса, показывается первым.
await calculateWithout("transformator-flyback.html", { vdss: "400", ilim: "1,2" }, ["СтатусНапряжение на ключе Vвх max + Vor = 450 В больше VDSS 400 В — даже без выброса от индуктивности рассеяния"], ["СтатусПиковый ток"]);
// Vor = 85 В: n = 6,8, D = 85/185 = 0,4595, Lp = 575,1 мкГн, Iпик = 1,229 А; Np ≥ 44,88 → Ns = ⌈6,6⌉ = 7, Np = ⌈47,6⌉ = 48 — фактически n = 6,857,
// Vor = 85,71 В; ключ 460,7 В — 70,88 % от 650 В > 70 % → «Риск» по рекомендации AN-4137 (65–70 %).
await calculate("transformator-flyback.html", { vor: "85" }, ["0,4595", "не больше 575,1 мкГн", "1,229 А", "48 / 7 — n = 6,857, Vor = 85,71 В", "460,7 В — 70,88 % от VDSS",
  "Обратное напряжение на выходном диоде Vвых + Vвх max / n66,69 В", "СтатусРиск: Vвх max + Vor = 70,88 % от VDSS — Fairchild AN-4137 закладывает 65–70 %"]);
// Vor = 80 В: n = 6,4, Np ≥ 43,41 → Ns = 7, Np = ⌈44,8⌉ = 45, n = 6,429, Vor = 80,36 В; ключ 455,4 В — 70,05 % → «Риск».
await calculate("transformator-flyback.html", { vor: "80" }, ["45 / 7 — n = 6,429, Vor = 80,36 В", "70,05 % от VDSS", "СтатусРиск"]);
// Граница 70 %: 450 В при VDSS 642,857 В — ровно 70 %, «Оценка»; при 642,85 В — 70,001 %, «Риск».
await calculateWithout("transformator-flyback.html", { vdss: "642,8571428571429" }, ["СтатусОценка", "— 70 % от VDSS"], ["Риск"], "boundary");
await calculate("transformator-flyback.html", { vdss: "642,85" }, ["СтатусРиск: Vвх max + Vor = 70,001 % от VDSS"], "boundary");
// Без AL: зазор μ0·1764·52,5e-6/500,4e-6 = 0,2326 мм — сопротивление сердечника не вычтено, зазор больше.
await calculate("transformator-flyback.html", { al: "" }, ["Немагнитный зазор без учёта выпучивания μ0·Np²·Ae / Lp0,2326 мм"]);
// Проверка партии (P2): малый AL (100 нГн) — без зазора 100·42² = 176,4 мкГн < 500,4 мкГн, индуктивность не набрать даже без зазора.
// Витки увеличиваются до √(500,4/0,1) = 70,74 → Ns = ⌈70,74/6⌉ = 12, Np = 72; индукция 500,4·1,318/(72·52,5) = 0,1744 Тл;
// зазор μ0·52,5e-6·(72²/500,4e-6 − 1/100e-9) = 0,02374 мм.
await calculateWithout("transformator-flyback.html", { al: "100" }, ["Витки увеличены по индуктивности сердечникабез зазора AL·Np² при 42 витках — 176,4 мкГн, меньше Lp: нужно не меньше √(Lp/AL) = 70,74 витков",
  "Витки первичной / вторичной обмотки72 / 12 — n = 6, Vor = 75 В", "Индукция при пиковом токе Lp·Iпик / (Np·Ae)0,1744 Тл",
  "Немагнитный зазор без учёта выпучивания μ0·Ae·(Np²/Lp − 1/AL)0,02374 мм"], ["не нужен"], "boundary");
// Ток вторичной обмотки — по фактическому коэффициенту (мутация проверяющего M10): Vor = 80 В → n = 6,4, Ns = ⌈43,41/6,4⌉ = 7,
// Np = ⌈44,8⌉ = 45, n = 45/7 = 6,429; пик вторичной 6,429·1,271 = 8,168 А (по расчётному n было бы 8,132 А).
await calculate("transformator-flyback.html", { vor: "80" }, ["Витки первичной / вторичной обмотки45 / 7 — n = 6,429, Vor = 80,36 В", "Пиковый ток вторичной обмотки n·Iпик8,168 А"]);
// Витки округляются вверх (мутация M12): Bmax 0,33 Тл → 38,06 витка, 38,06/6 = 6,34 → Ns = 7, Np = 42 (к ближайшему было бы 6 и 36).
await calculate("transformator-flyback.html", { bmax: "0,33" }, ["Наименьшее число витков Lp·I / (Bmax·Ae)38,06", "Витки первичной / вторичной обмотки42 / 7 — n = 6, Vor = 75 В"]);
// Первичные витки тоже округляются вверх (мутация M12 при дробном n): Vor = 77,5 В → n = 6,2, Ns = ⌈42,65/6,2⌉ = 7,
// n·Ns = 43,4 → Np = 44 (к ближайшему было бы 43); фактическое n = 44/7 = 6,286, Vor = 78,57 В.
await calculate("transformator-flyback.html", { vor: "77,5" }, ["Витки первичной / вторичной обмотки44 / 7 — n = 6,286, Vor = 78,57 В"]);
// Без VDSS — «Недостаточно данных».
await calculateWithout("transformator-flyback.html", { vdss: "" }, ["Напряжение на ключе Vвх max + Vor без выброса450 В", "СтатусНедостаточно данных: VDSS ключа не задано — напряжение на ключе без выброса 450 В не с чем сравнить"], ["% от VDSS", "Оценка"]);
await invalid("transformator-flyback.html", { vdcmin: "abc" }, "Заполните числами");
await invalid("transformator-flyback.html", { vdcmin: "0" }, "Входное напряжение: 0 < наименьшее ≤ наибольшее");
await invalid("transformator-flyback.html", { vdcmax: "90" }, "Входное напряжение: 0 < наименьшее ≤ наибольшее");
await invalid("transformator-flyback.html", { vdcmax: "1600" }, "Входное напряжение: 0 < наименьшее ≤ наибольшее");
await invalid("transformator-flyback.html", { vo: "0" }, "Выходное напряжение — больше 0");
await invalid("transformator-flyback.html", { vfo: "6" }, "Падение на выходном диоде — от 0 до 5 В");
await invalid("transformator-flyback.html", { po: "0" }, "Выходная мощность должна быть больше нуля");
await invalid("transformator-flyback.html", { eta: "101" }, "КПД задаётся в процентах");
await invalid("transformator-flyback.html", { fs: "0,5" }, "Частота преобразования — от 1 до 1000 кГц");
await invalid("transformator-flyback.html", { vor: "0" }, "Отражённое напряжение должно быть больше нуля");
await invalid("transformator-flyback.html", { ae: "0" }, "Сечение сердечника Ae должно быть больше нуля");
await invalid("transformator-flyback.html", { bmax: "3" }, "Наибольшая индукция — от 0,01 до 2 Тл");
await invalid("transformator-flyback.html", { al: "x" }, "AL — число в нГн на виток²");
await invalid("transformator-flyback.html", { al: "0" }, "AL должен быть больше нуля");
await invalid("transformator-flyback.html", { vdss: "x" }, "VDSS — число в вольтах");
await invalid("transformator-flyback.html", { ilim: "0" }, "Порог ограничения тока должен быть больше нуля");
await invalid("transformator-flyback.html", { ilim: "x" }, "Порог ограничения тока — число в амперах");

// Структурные проверки партии №5: запрещённые формулировки в статусах и
// скриптах, карточка источника, реестр, видимость полей по режиму
// (правило 7), ссылки на соседние страницы вместо дублирования, входящие
// ссылки, безопасность сетевых схем, атрибуция источников.
{
  kind = "structural";
  const batch5 = ["diody-vypryamitelya", "drosselnyy-filtr-vypryamitelya", "transformator-flyback"];
  const read = file => fs.readFileSync(path.join(sourceDir, file), "utf8");
  const visible = file => read(file).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const registry = read("ENGINEERING_AUDIT.md");
  for (const slug of batch5) {
    const html = read(`${slug}.html`);
    const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1] ?? "";
    const text = visible(`${slug}.html`);
    // «Стандарт безопасности» в тексте нужен — про изоляцию; вердиктов «безопасно» быть не должно ни в тексте, ни в статусах.
    check(!/проходит|безопасн|соответствует норм/i.test(script) && !/проходит|соответствует норм/i.test(text)
      && !/безопасн/i.test(text.replace(/Безопасность\./g, "").replace(/(стандарт[а-я]*|требования) безопасности/g, "")),
      `${slug}: запрещённые слова «проходит», «безопасно», «соответствует нормам»`);
    const card = html.match(/<section class="src">([\s\S]*?)<\/section>/)?.[1] ?? "";
    check(card.includes("Оценка, не нормативный вердикт") && card.includes("Границы применимости") && card.includes("Допущения")
      && card.includes("Редакция") && /обращение 02\.10\.2026/.test(card) && !/Проверил:/.test(card),
      `${slug}: карточка источника без статуса, допущений, границ, редакции или даты обращения`);
    check(registry.includes(`\`${slug}\``), `ENGINEERING_AUDIT.md: нет записи о ${slug}`);
    check(read("index.html").includes(`href="${slug}.html"`), `index.html: ${slug} нет в каталоге`);
    // Безопасность: изоляция — требование стандарта без вердикта; разряд конденсатора — резистором; совета замыкать накоротко нет.
    check(/IEC 62368-1/.test(text) && /пути утечки/.test(text) && /href="discharge-resistor-capacitor\.html"/.test(html),
      `${slug}: нет оговорки об изоляции по IEC 62368-1 или ссылки на разряд конденсатора`);
    check(!/(замкните|замыкайте|закоротите)[^.]{0,40}накоротко/i.test(text.replace(/не замыкайте выводы накоротко/gi, "")),
      `${slug}: совет замкнуть конденсатор накоротко`);
    check(!/под напряжением[^.]{0,40}(измеряйте|работайте|подключайте)/i.test(text), `${slug}: совет работать под напряжением`);
  }
  // Каждый переключатель влияет на расчёт, ненужные поля скрыты.
  const vis = (d, id) => d.getElementById(`f_${id}`)?.style.display !== "none";
  const change = (dom, id, value) => { const el = dom.window.document.getElementById(id); el.value = value; el.dispatchEvent(new dom.window.Event("change", { bubbles: true })); };
  let dom = await load("diody-vypryamitelya.html"); let d = dom.window.document;
  check(vis(d, "c") && !vis(d, "dv"), "diody-vypryamitelya: в режиме «по ёмкости» поле размаха пульсаций скрыто");
  change(dom, "rmode", "v");
  check(vis(d, "c") && vis(d, "dv"), "diody-vypryamitelya: в режиме «задать» видны размах пульсаций и ёмкость для броска");
  dom.window.close();
  // Пустые необязательные поля не дают «—» вместо числа и не протекают NaN.
  for (const [file, values] of [["diody-vypryamitelya.html", {}], ["diody-vypryamitelya.html", { vrrm: "", ifav: "", ifsm: "", tfsm: "", rw: "0,5" }],
    ["diody-vypryamitelya.html", { rmode: "v", c: "", rw: "0,5" }], ["drosselnyy-filtr-vypryamitelya.html", {}],
    ["transformator-flyback.html", { al: "", vdss: "", ilim: "" }]]) {
    const dm = await load(file); setValues(dm.window.document, values); dm.window.document.getElementById("go").click();
    const res = dm.window.document.getElementById("res").textContent.replace(/\s+/g, " ");
    check(!/—\s(А|В|мс|Ом|мкГн|мм|Тл|°C|ч|Гц|Вт|%)(?![а-яА-Я])/.test(res) && !/NaN|Infinity|undefined/.test(res),
      `${file}: «—» вместо числа при пустых необязательных полях: ${res.slice(0, 200)}`);
    dm.window.close();
  }
  // Не дублировать соседние страницы, а ссылаться на них.
  const links = { "diody-vypryamitelya": ["pulsacii-vypryamitelya", "diode-bridge-loss"],
    "drosselnyy-filtr-vypryamitelya": ["lc-filtr-raschet", "diody-vypryamitelya"],
    "transformator-flyback": ["raschet-transformatora", "toroid-turns-al"] };
  for (const [from, list] of Object.entries(links)) {
    const article = read(`${from}.html`).match(/<p class="intro">[\s\S]*?<section class="related">/)?.[0] ?? "";
    for (const to of list) check(article.includes(`href="${to}.html"`), `${from}: в тексте нет ссылки на ${to}`);
  }
  // Входящие ссылки на новые страницы из «Смотрите также» существующих.
  const inbound = [["pulsacii-vypryamitelya", "diody-vypryamitelya"], ["pulsacii-vypryamitelya", "drosselnyy-filtr-vypryamitelya"],
    ["diode-bridge-loss", "diody-vypryamitelya"], ["lc-filtr-raschet", "drosselnyy-filtr-vypryamitelya"],
    ["raschet-transformatora", "transformator-flyback"],
    ["toroid-turns-al", "transformator-flyback"]];
  for (const [from, to] of inbound) {
    const block = read(`${from}.html`).match(/<section class="related">([\s\S]*?)<\/section>/)?.[1] ?? "";
    check(block.includes(`href="${to}.html"`), `${from}: в «Смотрите также» нет ссылки на ${to}`);
  }
  // Атрибуция: правило и формула приписаны своему источнику, оценка названа оценкой.
  const di = visible("diody-vypryamitelya.html");
  check(/Sedra/.test(di) && /Petry/.test(di) && /Diodes Incorporated/.test(di) && /Rectron/.test(di) && /20 %/.test(di) && /Ametherm/.test(di) && /оценк/i.test(di),
    "diody-vypryamitelya: формулы токов, снижение IF(AV) и бросок не приписаны источникам");
  const dr = visible("drosselnyy-filtr-vypryamitelya.html");
  check(/Radiotron/.test(dr) && /ARRL/.test(dr) && /QST/.test(dr) && /не ослабляет пульсации/.test(dr) && /растёт к пиковому/.test(dr),
    "drosselnyy-filtr-vypryamitelya: нет атрибуции критической индуктивности или проверки резонанса");
  const fl = visible("transformator-flyback.html");
  check(/AN-4137/.test(fl) && /выпучивани/.test(fl) && /SLUP127/.test(fl) && /индуктивности рассеяния/.test(fl) && /опасный заряд/.test(fl),
    "transformator-flyback: нет атрибуции AN-4137, оговорки о выпучивании, о выбросе или о заряде входного конденсатора");
}

// ===========================================================================
// --- Партия №5, data_r.py ---
// Силовая электроника: потери и КПД buck-преобразователя, RCD-снаббер
// обратноходового преобразователя, нагрев MOSFET с ростом Rds(on), резистор
// затвора и драйвер MOSFET/IGBT. Ожидаемые значения посчитаны отдельным
// скриптом (scratchpad r/ref.py) другими способами, а не кодом страниц:
// действующие токи buck — численным интегрированием формы тока, энергия
// переключения — интегралом v·i по фронтам, D — делением отрезка из равенства
// вольт-секунд на дросселе; энергия клампа — интегралом Vsn·i(t) по спаду тока
// рассеяния; Tj — простой итерацией T(k+1) = Ta + Rθ·P(T(k)) и W-функцией
// Ламберта (метод Ньютона). Округление — как у toPrecision; сценарии подобраны
// без «ничьих» при округлении (скрипт их отлавливает). Два эталона — прямо из
// источников: пример Nexperia AN90059 (10/0 В, 10 Ом, плато 4,2 В → 0,58 и
// 0,42 А) и пример базы знаний Infineon (36 нКл, 15 В, плато 9,9 В, драйвер
// 0,85 Ом: 13,32 Ом → 100 нс, 15 Ом → 112 нс); третий — оценка TI (Kollman):
// при Vclamp/Vreset = 1,5 потери клампа втрое больше энергии рассеяния.
// ===========================================================================

// --- 1. poteri-buck-preobrazovatelya: ROHM 64AN035E, Infineon, TI SLVA390A/SLVAEQ9/SLVA477B ---
// Эталон 1 (по умолчанию, синхронная): D = (3,3 + 5·(0,004 + 0,010) + 2·20 нс·500 кГц·(0,8 − 5·0,004)) / (12 − 5·0,008 + 5·0,004)
// = 3,3856/11,98 = 0,2826 (в два мёртвых времени на нижнем ключе Vsd, третий отзыв бота);
// ΔI = (12 − 3,3 − 5·(0,008 + 0,010))·0,2826/(500 кГц·3,3 мкГн) = 1,475 А (проверка Codex: на дросселе — с падениями);
// Iд,др = √(25 + 1,475²/12) = 5,018 А; Iд1 = √0,2826·5,018 = 2,668 А; канал нижнего ключа D2 = 1 − 0,2826 − 0,02 = 0,6974,
// размах в нём 1,475·0,6974/0,7174 = 1,434 А, Iд2 = √(0,6974·(25 + 1,434²/12)) = 4,19 А, потери 70,22 мВт.
// Ток на плато (5 − 3)/3 = 0,6667 А и 3/2 = 1,5 А, фронты 5 нКл/0,6667 А = 7,5 нс и 5/1,5 = 3,333 нс;
// переключение ½·12·500 кГц·(4,263·7,5 + 5,737·3,333) нс = 153,3 мВт; Coss ½·900 пФ·144·500 кГц = 32,4 мВт;
// мёртвое время 2·0,8·5·20 нс·500 кГц = 80 мВт; затворы 30 нКл·5·500 кГц = 75 мВт; DCR 25,18·0,01 = 251,8 мВт;
// контроллер 12·2 мА = 24 мВт; сумма 743,6 мВт; КПД 16,5/17,24 = 95,69 %. Qrr и сердечник не заданы — в статусе.
await calculateWithout("poteri-buck-preobrazovatelya.html", {}, ["Коэффициент заполнения D с учётом падений0,2826 (идеальный Vout / Vin = 0,275)", "Размах тока дросселя ΔI1,475 А — по индуктивности", "Ток дросселя: впадина / пик4,263 А / 5,737 А", "Действующий ток дросселя5,018 А", "Действующий ток верхнего ключа2,668 А", "Действующий ток нижнего ключа — канал, без мёртвого времени4,19 А при доле периода D2 = 1 − D − 2·tм·fsw = 0,6974", "Ток затвора на плато: включение / выключение666,7 мА / 1,5 А", "Фронты верхнего ключа: включение / выключение7,5 нс / 3,333 нс", "Потери: проводимость верхнего ключа56,93 мВт — 7,66 %", "Потери: переключение верхнего ключа153,3 мВт — 20,6 %", "Потери: заряд ёмкостей Coss32,4 мВт — 4,36 %", "Потери: проводимость нижнего ключа70,22 мВт — 9,44 %", "Потери: мёртвое время80 мВт — 10,8 %", "Потери: заряд затворов75 мВт — 10,1 %", "Потери: DCR дросселя251,8 мВт — 33,9 %", "Потери: собственное потребление контроллера24 мВт — 3,23 %", "Сумма потерь743,6 мВт", "КПД95,69 %", "СтатусОценка: КПД ≈ 95,69 %, главная статья потерь — DCR дросселя (33,9 % потерь); не заданы и не учтены: обратное восстановление, потери в сердечнике"], ["Потери: обратное восстановление", "Потери: сердечник"]);
// Эталон 2 (с диодом 0,45 В): D = (3,3 + 0,45 + 0,05)/(12 − 0,04 + 0,45) = 3,8/12,41 = 0,3062;
// диод 0,45·5·(1 − 0,3062) = 1,561 Вт — 74 % потерь, затворы только верхнего 10 нКл·5·500 кГц = 25 мВт; КПД 88,67 %.
await calculateWithout("poteri-buck-preobrazovatelya.html", { top: "diode" }, ["Коэффициент заполнения D с учётом падений0,3062 (идеальный Vout / Vin = 0,275)", "Размах тока дросселя ΔI1,598 А — по индуктивности", "Ток дросселя: впадина / пик4,201 А / 5,799 А", "Действующий ток дросселя5,021 А", "Действующий ток верхнего ключа2,779 А", "Средний ток диода3,469 А", "Ток затвора на плато: включение / выключение666,7 мА / 1,5 А", "Фронты верхнего ключа: включение / выключение7,5 нс / 3,333 нс", "Потери: проводимость верхнего ключа61,76 мВт — 2,93 %", "Потери: переключение верхнего ключа152,5 мВт — 7,23 %", "Потери: заряд ёмкостей Coss32,4 мВт — 1,54 %", "Потери: прямое падение диода1,561 Вт — 74 %", "Потери: заряд затворов25 мВт — 1,19 %", "Потери: DCR дросселя252,1 мВт — 12 %", "Потери: собственное потребление контроллера24 мВт — 1,14 %", "Сумма потерь2,109 Вт", "КПД88,67 %", "СтатусОценка: КПД ≈ 88,67 %, главная статья потерь — прямое падение диода (74 % потерь); не заданы и не учтены: обратное восстановление, потери в сердечнике"], ["мёртвое время", "нижнего ключа"]);
// Эталон 3 (48 → 12 В, 10 А, 200 кГц, ΔI задан 3,2 А, фронты 15 и 12 нс, все необязательные заданы):
// D = (12 + 10·(0,006 + 0,003) + 2·30 нс·200 кГц·(0,9 − 0,06))/(48 − 0,06 + 0,06) = 12,10008/48 = 0,2521; переключение ½·48·200 кГц·(8,4·15 + 11,6·12) нс = 1,273 Вт;
// Qrr 40 нКл·48·200 кГц = 384 мВт; Coss ½·1 нФ·48²·200 кГц = 230,4 мВт; сердечник 0,4 Вт; КПД 120/123,7 = 97,04 %.
await calculateWithout("poteri-buck-preobrazovatelya.html", { vin: "48", vout: "12", iout: "10", fsw: "200", rip: "di", di: "3,2", rh: "6", rl: "6", vdrv: "10", qgh: "30", qgl: "30", sw: "t", tr: "15", tf: "12", vsd: "0,9", tdt: "30", cossh: "500", cossl: "500", qrr: "40", dcr: "3", pcore: "0,4", iq: "5" }, ["Коэффициент заполнения D с учётом падений0,2521 (идеальный Vout / Vin = 0,25)", "Размах тока дросселя ΔI3,2 А — задан", "Ток дросселя: впадина / пик8,4 А / 11,6 А", "Действующий ток дросселя10,04 А", "Действующий ток верхнего ключа5,042 А", "Действующий ток нижнего ключа — канал, без мёртвого времени8,614 А при доле периода D2 = 1 − D − 2·tм·fsw = 0,7359", "Фронты верхнего ключа: включение / выключение15 нс / 12 нс", "Потери: проводимость верхнего ключа152,5 мВт — 4,17 %", "Потери: переключение верхнего ключа1,273 Вт — 34,8 %", "Потери: заряд ёмкостей Coss230,4 мВт — 6,3 %", "Потери: обратное восстановление384 мВт — 10,5 %", "Потери: проводимость нижнего ключа445,2 мВт — 12,2 %", "Потери: мёртвое время108 мВт — 2,95 %", "Потери: заряд затворов120 мВт — 3,28 %", "Потери: DCR дросселя302,6 мВт — 8,28 %", "Потери: сердечник дросселя400 мВт — 10,9 %", "Потери: собственное потребление контроллера240 мВт — 6,57 %", "Сумма потерь3,656 Вт", "КПД97,04 %", "СтатусОценка: КПД ≈ 97,04 %, главная статья потерь — переключение верхнего ключа (34,8 % потерь)"], ["Не заданы"]);
// С диодом 0,5 В, ΔI = 2 А, фронты 20 и 15 нс: D = (3,3 + 0,5 + 0,05)/(12 − 0,04 + 0,5) = 3,85/12,46 = 0,309;
// переключение ½·12·500 кГц·(4·20 + 6·15) нс = 510 мВт; диод 0,5·5·0,691 = 1,728 Вт.
await calculateWithout("poteri-buck-preobrazovatelya.html", { top: "diode", vfd: "0,5", rip: "di", di: "2", sw: "t", tr: "20", tf: "15" }, ["Коэффициент заполнения D с учётом падений0,309 (идеальный Vout / Vin = 0,275)", "Размах тока дросселя ΔI2 А — задан", "Ток дросселя: впадина / пик4 А / 6 А", "Действующий ток дросселя5,033 А", "Действующий ток верхнего ключа2,798 А", "Средний ток диода3,455 А", "Фронты верхнего ключа: включение / выключение20 нс / 15 нс", "Потери: проводимость верхнего ключа62,62 мВт — 2,38 %", "Потери: переключение верхнего ключа510 мВт — 19,4 %", "Потери: заряд ёмкостей Coss32,4 мВт — 1,23 %", "Потери: прямое падение диода1,728 Вт — 65,6 %", "Потери: заряд затворов25 мВт — 0,949 %", "Потери: DCR дросселя253,3 мВт — 9,61 %", "Потери: собственное потребление контроллера24 мВт — 0,911 %", "Сумма потерь2,635 Вт", "КПД86,23 %", "СтатусОценка: КПД ≈ 86,23 %, главная статья потерь — прямое падение диода (65,6 % потерь); не заданы и не учтены: обратное восстановление, потери в сердечнике"], ["Ток затвора на плато", "мёртвое время"]);
// Конфигурация с пустыми необязательными полями: D = (3,3 + 5·0,004 + 0,02·0,78)/(12 − 0,04 + 0,02) = 3,3356/11,98 = 0,2784;
// Coss — только верхний ключ, как у ROHM: ½·300 пФ·144·500 кГц = 10,8 мВт; всё неучтённое перечислено в статусе, «—» нет.
await calculateWithout("poteri-buck-preobrazovatelya.html", { cossl: "", dcr: "", iq: "" }, ["Коэффициент заполнения D с учётом падений0,2784 (идеальный Vout / Vin = 0,275)", "Размах тока дросселя ΔI1,461 А — по индуктивности", "Ток дросселя: впадина / пик4,269 А / 5,731 А", "Действующий ток дросселя5,018 А", "Действующий ток верхнего ключа2,648 А", "Действующий ток нижнего ключа — канал, без мёртвого времени4,202 А при доле периода D2 = 1 − D − 2·tм·fsw = 0,7016", "Ток затвора на плато: включение / выключение666,7 мА / 1,5 А", "Фронты верхнего ключа: включение / выключение7,5 нс / 3,333 нс", "Потери: проводимость верхнего ключа56,08 мВт — 12,6 %", "Потери: переключение верхнего ключа153,4 мВт — 34,4 %", "Потери: заряд ёмкостей Coss10,8 мВт — 2,42 %", "Потери: проводимость нижнего ключа70,63 мВт — 15,8 %", "Потери: мёртвое время80 мВт — 17,9 %", "Потери: заряд затворов75 мВт — 16,8 %", "Сумма потерь445,9 мВт", "КПД97,37 %", "СтатусОценка: КПД ≈ 97,37 %, главная статья потерь — переключение верхнего ключа (34,4 % потерь); не заданы и не учтены: ёмкость нижнего ключа или диода, обратное восстановление, DCR дросселя, потери в сердечнике, ток контроллера"], ["—  %", "NaN"]);
// Границы: впадина тока 10 мА — ещё непрерывный режим (ΔI = 9,98 А при 5 А), ΔI = 0 допустим;
// фронты — каждый в своём интервале (проверки ниже). Мёртвое время сдвигает и D: 2·tм < (1 − D(tм))·T при
// 2·tм·fsw < (11,98 − 3,37)/(11,98 + 0,78) = 0,6748, то есть tм < 674,76 нс — 674 нс считается, 675 нс — ошибка.
await calculate("poteri-buck-preobrazovatelya.html", { rip: "di", di: "9,98" }, ["Ток дросселя: впадина / пик10 мА / 9,99 А", "Действующий ток дросселя5,771 А", "Потери: переключение верхнего ключа100,1 мВт — 12,3 %"], "boundary");
await calculate("poteri-buck-preobrazovatelya.html", { rip: "di", di: "0" }, ["Размах тока дросселя ΔI0 А — задан", "Действующий ток дросселя5 А", "КПД95,65 %"], "boundary");
await calculate("poteri-buck-preobrazovatelya.html", { sw: "t", tr: "300", tf: "262" }, ["Фронты верхнего ключа: включение / выключение300 нс / 262 нс", "Потери: переключение верхнего ключа8,346 Вт"], "boundary");
// Проверка Codex (P2): каждый фронт — в своём интервале. Включение — в D·T = 565,2 нс, выключение — в (1 − D)·T = 1434,8 нс;
// раньше сумма фронтов сравнивалась с D·T, и 300 + 263 нс отвергалось, хотя оба фронта укладываются.
await calculateWithout("poteri-buck-preobrazovatelya.html", { sw: "t", tr: "300", tf: "263" }, ["Фронты верхнего ключа: включение / выключение300 нс / 263 нс", "Статус"], ["не короче"], "boundary");
await calculateWithout("poteri-buck-preobrazovatelya.html", { sw: "t", tr: "565", tf: "8" }, ["Фронты верхнего ключа: включение / выключение565 нс / 8 нс", "Статус"], ["не короче"], "boundary");
await calculateWithout("poteri-buck-preobrazovatelya.html", { sw: "t", tr: "566", tf: "8" }, ["Фронт включения (566 нс) не короче открытого состояния D·T = 565,2 нс"], ["Статус"], "boundary");
await calculateWithout("poteri-buck-preobrazovatelya.html", { sw: "t", tr: "10", tf: "1434" }, ["Фронты верхнего ключа: включение / выключение10 нс / 1,434 мкс", "Статус"], ["не короче"], "boundary");
// 1435 нс против 1434,79 нс: в четыре цифры оба «1,435», поэтому fx показывает предел с пятой цифрой.
await calculateWithout("poteri-buck-preobrazovatelya.html", { sw: "t", tr: "10", tf: "1435" }, ["Фронт выключения (1,435 мкс) не короче закрытого состояния (1 − D)·T = 1,4348 мкс"], ["Статус"], "boundary");
// Проверка Codex (P2): размах тока — по напряжению на дросселе с падениями. 5 → 3,3 В, 10 А, Rds(on) верхнего 50 мОм, DCR 10 мОм:
// D = (3,3 + 10·0,014 + 0,02·(0,8 − 10·0,004))/(5 − 0,5 + 0,04) = 3,4552/4,54 = 0,7611;
// ΔI = (5 − 3,3 − 10·0,06)·0,7611/(500 кГц·3,3 мкГн) = 507,4 мА (по идеальному Vin − Vout — 784,1 мА).
await calculate("poteri-buck-preobrazovatelya.html", { vin: "5", vout: "3,3", iout: "10", rh: "50" }, ["Коэффициент заполнения D с учётом падений0,7611 (идеальный Vout / Vin = 0,66)", "Размах тока дросселя ΔI507,4 мА — по индуктивности", "Ток дросселя: впадина / пик9,746 А / 10,25 А"]);
await calculate("poteri-buck-preobrazovatelya.html", { tdt: "674" }, ["Потери: мёртвое время2,696 Вт", "при доле периода D2 = 1 − D − 2·tм·fsw = 0,0008147"], "boundary");
await calculateWithout("poteri-buck-preobrazovatelya.html", { tdt: "675" }, ["Два мёртвых времени (1,35 мкс) не короче закрытого состояния верхнего ключа (1 − D)·T = 1,349 мкс; D здесь уже учитывает Vsd в мёртвое время"], ["Статус"], "boundary");
// Полный заряд затвора ровно Qgs2 + Qgd = 5 нКл ещё допустим: затворы (5 + 20) нКл·5 В·500 кГц = 62,5 мВт.
await calculate("poteri-buck-preobrazovatelya.html", { qgh: "5" }, ["Потери: заряд затворов62,5 мВт"], "boundary");
await invalid("poteri-buck-preobrazovatelya.html", { qgh: "4,99" }, "Qgs2 + Qgd больше полного заряда затвора Qg");
await invalid("poteri-buck-preobrazovatelya.html", { rip: "di", di: "10" }, "не меньше 2·Iout");
await invalid("poteri-buck-preobrazovatelya.html", { vin: "3,38" }, "не оставляет запаса");
await invalid("poteri-buck-preobrazovatelya.html", { vin: "12 В" }, "Заполните числами: Vin, Vout");
await invalid("poteri-buck-preobrazovatelya.html", { vout: "12" }, "У понижающего преобразователя Vout меньше Vin");
await invalid("poteri-buck-preobrazovatelya.html", { iout: "0" }, "Напряжения, ток нагрузки и частота должны быть больше нуля");
await invalid("poteri-buck-preobrazovatelya.html", { rh: "0" }, "Rds(on) верхнего ключа, напряжение драйвера, Qg и Coss должны быть больше нуля");
await invalid("poteri-buck-preobrazovatelya.html", { rl: "abc" }, "Для синхронной схемы заполните числами");
await invalid("poteri-buck-preobrazovatelya.html", { tdt: "0" }, "мёртвое время должны быть больше нуля");
await invalid("poteri-buck-preobrazovatelya.html", { top: "diode", vfd: "" }, "Введите прямое напряжение диода");
await invalid("poteri-buck-preobrazovatelya.html", { top: "diode", vfd: "0" }, "Прямое напряжение диода должно быть больше нуля");
await invalid("poteri-buck-preobrazovatelya.html", { cossl: "x" }, "Ёмкость нижнего ключа или диода — число");
await invalid("poteri-buck-preobrazovatelya.html", { qrr: "0" }, "Qrr должен быть больше нуля");
await invalid("poteri-buck-preobrazovatelya.html", { dcr: "abc" }, "DCR — число в миллиомах");
await invalid("poteri-buck-preobrazovatelya.html", { pcore: "-1" }, "Потери в сердечнике не могут быть отрицательными");
await invalid("poteri-buck-preobrazovatelya.html", { iq: "много" }, "Ток контроллера — число");
await invalid("poteri-buck-preobrazovatelya.html", { l: "0" }, "Индуктивность должна быть больше нуля");
await invalid("poteri-buck-preobrazovatelya.html", { rip: "di", di: "-1" }, "Размах тока не может быть отрицательным");
await invalid("poteri-buck-preobrazovatelya.html", { vpl: "5" }, "Напряжение плато — больше 0 и меньше напряжения драйвера");
await invalid("poteri-buck-preobrazovatelya.html", { qgs2: "-1" }, "Qgs2 не может быть отрицательным");
await invalid("poteri-buck-preobrazovatelya.html", { rgon: "0" }, "Qgd и сопротивления цепи затвора должны быть больше нуля");
await invalid("poteri-buck-preobrazovatelya.html", { sw: "t", tr: "0" }, "Времена фронтов должны быть больше нуля");
await invalid("poteri-buck-preobrazovatelya.html", { sw: "t", tf: "" }, "Введите времена фронтов");

// --- 2. nagrev-mosfet: Infineon Rds(on)(Tj) = R25·(1 + α/100)^(Tj − 25), onsemi AND9016 ---
// Эталон 1 (по умолчанию): α = 100·(1,9^(1/125) − 1) = 0,5148 %/°C; Rθ = 1 + 0,5 + 20 = 21,5 °C/Вт;
// без роста Rds(on): 40 + 21,5·(0,5 + 8²·0,02) = 78,27 °C; итерация T = 40 + 21,5·(0,5 + 1,28·1,9^((T − 25)/125)) → 88,97 °C
// (W-функция даёт то же); Rds(on) = 20·1,9^(63,97/125) = 27,78 мОм; G = ln 1,9/125·(88,97 − 50,75) = 0,196;
// граница разгона Iкр = √(1/(e·B·21,5·0,02·e^(B·25,75))) = 12,08 А, Tj на границе 50,75 + 1/B = 245,5 °C.
await calculateWithout("nagrev-mosfet.html", {}, ["Температурный коэффициент Rds(on) по двум точкам α0,5148 %/°C", "Тепловое сопротивление кристалл–среда Rθ21,5 °C/Вт", "Tj без учёта роста Rds(on) — по сопротивлению при 25 °C78,27 °C", "Температура кристалла Tj с ростом Rds(on)88,97 °C", "Rds(on) при Tj27,78 мОм — 1,389 от значения при 25 °C", "Потери проводимости Iд²·Rds(on)(Tj)1,778 Вт", "Всего в ключе2,278 Вт", "Температура корпуса / радиатора86,69 / 85,55 °C", "Петлевое усиление G = Rθ·dP/dTj0,196 — ошибка в Rθ или потерях усиливается в 1/(1 − G) = 1,24 раза", "Граница теплового разгона по моделиток 12,08 А, Tj на границе 245,5 °C", "СтатусОценка: Tj ≈ 88,97 °C не больше Tj max 175 °C"], ["экстраполяц", "Риск"]);
// Эталон 2 (без радиатора, Rθja = 40): без роста 111,2 °C, с ростом 165,1 °C — выше второй точки 150 °C: «с экстраполяцией»;
// G = 0,54, 1/(1 − G) = 2,17. При 9 А > Iкр = 8,65 А устойчивой температуры нет — «Риск теплового разгона», Tj не выводится.
await calculateWithout("nagrev-mosfet.html", { path: "ja" }, ["Температурный коэффициент Rds(on) по двум точкам α0,5148 %/°C", "Тепловое сопротивление кристалл–среда Rθ40 °C/Вт", "Tj без учёта роста Rds(on) — по сопротивлению при 25 °C111,2 °C", "Температура кристалла Tj с ростом Rds(on)165,1 °C", "Rds(on) при Tj41,07 мОм — 2,054 от значения при 25 °C", "Потери проводимости Iд²·Rds(on)(Tj)2,629 Вт", "Всего в ключе3,129 Вт", "Петлевое усиление G = Rθ·dP/dTj0,54 — ошибка в Rθ или потерях усиливается в 1/(1 − G) = 2,17 раза", "Граница теплового разгона по моделиток 8,65 А, Tj на границе 254,7 °C", "СтатусОценка с экстраполяцией: Tj ≈ 165,1 °C не больше Tj max 175 °C — Tj выше второй точки графика 150 °C, Rds(on) продолжено по модели"], ["Температура корпуса"]);
await calculateWithout("nagrev-mosfet.html", { path: "ja", irms: "9" }, ["Температурный коэффициент Rds(on) по двум точкам α0,5148 %/°C", "Тепловое сопротивление кристалл–среда Rθ40 °C/Вт", "Tj без учёта роста Rds(on) — по сопротивлению при 25 °C124,8 °C", "Устойчивая температура кристалланет — потери растут с нагревом быстрее, чем отводится тепло", "Граница теплового разгона по моделиток 8,65 А, Tj на границе 254,7 °C", "СтатусРиск теплового разгона: при токе 9 А устойчивой температуры кристалла нет — по модели граница 8,65 А"], ["Температура кристалла Tj", "Оценка"]);
await calculateWithout("nagrev-mosfet.html", { path: "ja", tjmax: "150" }, ["Температурный коэффициент Rds(on) по двум точкам α0,5148 %/°C", "Тепловое сопротивление кристалл–среда Rθ40 °C/Вт", "Tj без учёта роста Rds(on) — по сопротивлению при 25 °C111,2 °C", "Температура кристалла Tj с ростом Rds(on)165,1 °C", "Rds(on) при Tj41,07 мОм — 2,054 от значения при 25 °C", "Потери проводимости Iд²·Rds(on)(Tj)2,629 Вт", "Всего в ключе3,129 Вт", "Петлевое усиление G = Rθ·dP/dTj0,54 — ошибка в Rθ или потерях усиливается в 1/(1 − G) = 2,17 раза", "Граница теплового разгона по моделиток 8,65 А, Tj на границе 254,7 °C", "СтатусРасчётная температура кристалла 165,1 °C больше Tj max 150 °C"], ["Оценка"]);
await calculateWithout("nagrev-mosfet.html", { tjmax: "" }, ["Температурный коэффициент Rds(on) по двум точкам α0,5148 %/°C", "Тепловое сопротивление кристалл–среда Rθ21,5 °C/Вт", "Tj без учёта роста Rds(on) — по сопротивлению при 25 °C78,27 °C", "Температура кристалла Tj с ростом Rds(on)88,97 °C", "Rds(on) при Tj27,78 мОм — 1,389 от значения при 25 °C", "Потери проводимости Iд²·Rds(on)(Tj)1,778 Вт", "Всего в ключе2,278 Вт", "Температура корпуса / радиатора86,69 / 85,55 °C", "Петлевое усиление G = Rθ·dP/dTj0,196 — ошибка в Rθ или потерях усиливается в 1/(1 − G) = 1,24 раза", "Граница теплового разгона по моделиток 12,08 А, Tj на границе 245,5 °C", "СтатусНедостаточно данных: Tj max из паспорта не задана; оценка Tj ≈ 88,97 °C"], ["Оценка:"]);
// Границы: Tj = 88,971 °C против Tj max 88,98 и 88,97 — число у порога не округляется через него; ток 12,082 А — ещё
// устойчиво (Tj 244,2 °C больше Tj max), 12,083 А — уже разгон, и ток показан 12,083 А против границы 12,08 А;
// k2 = 1 — сопротивление не растёт, Tj совпадает с простым расчётом, строк разгона нет.
await calculate("nagrev-mosfet.html", { tjmax: "88,98" }, ["СтатусОценка: Tj ≈ 88,97 °C не больше Tj max 88,98 °C"], "boundary");
await calculate("nagrev-mosfet.html", { tjmax: "88,97" }, ["СтатусРасчётная температура кристалла 88,971 °C больше Tj max 88,97 °C"], "boundary");
await calculateWithout("nagrev-mosfet.html", { irms: "12,082" }, ["Температура кристалла Tj с ростом Rds(on)244,2 °C", "СтатусРасчётная температура кристалла 244,2 °C больше Tj max 175 °C"], ["Риск теплового разгона"], "boundary");
await calculate("nagrev-mosfet.html", { irms: "12,083" }, ["СтатусРиск теплового разгона: при токе 12,083 А устойчивой температуры кристалла нет — по модели граница 12,082 А"], "boundary");
await calculateWithout("nagrev-mosfet.html", { k2: "1" }, ["Температура кристалла Tj с ростом Rds(on)78,27 °C", "Tj без учёта роста Rds(on) — по сопротивлению при 25 °C78,27 °C", "Температурный коэффициент Rds(on) по двум точкам α0 %/°C"], ["Петлевое усиление", "Граница теплового разгона"], "boundary");
// t2 = 200 °C — ещё в области: α = 100·(1,9^(1/175) − 1) = 0,3674 %/°C, Tj 85,05 °C; k2 = 5 — α = 100·(5^(1/125) − 1) = 1,296 %/°C,
// и при 8 А это уже разгон (A·B = 0,49 > 1/e).
await calculate("nagrev-mosfet.html", { t2: "200" }, ["Температурный коэффициент Rds(on) по двум точкам α0,3674 %/°C", "Температура кристалла Tj с ростом Rds(on)85,05 °C"], "boundary");
await calculate("nagrev-mosfet.html", { k2: "5" }, ["Температурный коэффициент Rds(on) по двум точкам α1,296 %/°C", "СтатусРиск теплового разгона"], "boundary");
await calculate("nagrev-mosfet.html", { tjmax: "250" }, ["Tj max250 °C"], "boundary");
await invalid("nagrev-mosfet.html", { irms: "abc" }, "Заполните числами действующий ток");
await invalid("nagrev-mosfet.html", { r25: "0" }, "Ток и Rds(on) должны быть больше нуля");
await invalid("nagrev-mosfet.html", { t2: "25" }, "Вторая точка графика Rds(on) от Tj — температура выше 25 °C и не выше 200 °C");
await invalid("nagrev-mosfet.html", { t2: "200,1" }, "Вторая точка графика Rds(on) от Tj — температура выше 25 °C и не выше 200 °C");
await invalid("nagrev-mosfet.html", { k2: "0,99" }, "Нормированное Rds(on) во второй точке — от 1 до 5");
await invalid("nagrev-mosfet.html", { k2: "5,01" }, "Нормированное Rds(on) во второй точке — от 1 до 5");
await invalid("nagrev-mosfet.html", { ta: "150,1" }, "Температура среды — от −55 до 150 °C");
await invalid("nagrev-mosfet.html", { ta: "-55,1" }, "Температура среды — от −55 до 150 °C");
await invalid("nagrev-mosfet.html", { psw: "-0,1" }, "Потери переключения не могут быть отрицательными");
await invalid("nagrev-mosfet.html", { psw: "x" }, "Потери переключения — число в ваттах");
await invalid("nagrev-mosfet.html", { tjmax: "40" }, "Tj max должна быть выше температуры среды");
await invalid("nagrev-mosfet.html", { tjmax: "250,1" }, "Tj max — не выше 250 °C");
await invalid("nagrev-mosfet.html", { path: "ja", rja: "0" }, "Тепловое сопротивление должно быть больше нуля");
await invalid("nagrev-mosfet.html", { rjc: "-1" }, "Тепловые сопротивления не могут быть отрицательными");
await invalid("nagrev-mosfet.html", { rjc: "0", rcs: "0", rsa: "0" }, "Суммарное тепловое сопротивление должно быть больше нуля");
await invalid("nagrev-mosfet.html", { rsa: "" }, "Введите тепловые сопротивления кристалл–корпус");

// --- 3. rezistor-zatvora-mosfet: Nexperia AN90059, Infineon, TI SLUA618A, Wu (IR), TI UCC21520 ---
// Эталон 1 (по умолчанию, драйвер 1EDN751x 0,85/0,35 Ом): Rвкл = 0,85 + 10 + 1 = 11,85 Ом, Rвыкл = 0,35 + 10 + 1 = 11,35 Ом;
// ток на плато 7/11,85 = 590,7 мА и 5/11,35 = 440,5 мА; плато 20 нКл/0,5907 А = 33,86 нс; P = 60 нКл·12 В·100 кГц = 72 мВт,
// во внешних резисторах 36·(10/11,85 + 10/11,35) = 62,1 мВт; ΔVgs = 10 пФ·20 В/нс·11,35 Ом = 2,27 В < 3·0,8 = 2,4 В;
// допустимая dv/dt 2,4/(10 пФ·11,35 Ом) = 21,15 В/нс; наибольший внешний Rg выкл 2,4/(10 пФ·20 В/нс) − 1 − 0,35 = 10,65 Ом.
await calculateWithout("rezistor-zatvora-mosfet.html", {}, ["Сопротивление цепи затвора: включение / выключение11,85 / 11,35 Ом", "Ток затвора в начале фронта: включение / выключение1,013 А / 1,057 А", "Ток затвора на плато Миллера: включение / выключение590,7 мА / 440,5 мА", "Длительность плато Qgd / Iз: включение / выключение33,86 нс / 45,4 нс", "Время переключения (Qgs2 + Qgd) / Iз: включение / выключение42,32 нс / 56,75 нс", "Мощность драйвера Qg·(Vвкл − Vвыкл)·fsw72 мВт, средний ток от источника Qg·fsw — 6 мА", "Из неё: в драйвере / во внешних резисторах / во внутреннем Rg ключа3,692 мВт / 62,1 мВт / 6,21 мВт", "Наведённое напряжение ΔVgs ≈ Crss·dv/dt·Rэкв2,27 В при Rэкв = 11,35 Ом", "Наибольшая dv/dt без ложного включения21,15 В/нс", "Наибольший внешний резистор цепи выключения по условию ложного включения10,65 Ом", "СтатусОценка: наведённое напряжение ΔVgs ≈ 2,27 В ниже порога при нагреве 2,4 В"], ["Риск", "Rgs"]);
// Эталон 2 (пример Nexperia AN90059): (10 − 4,2)/10 = 0,58 А, (4,2 − 0)/10 = 0,42 А.
await calculate("rezistor-zatvora-mosfet.html", { von: "10", rsrc: "0", rsnk: "0", rg: "10", rgi: "0", vpl: "4,2" }, ["Ток затвора на плато Миллера: включение / выключение580 мА / 420 мА"]);
// Эталон 3 (пример Infineon): 15 В, плато 9,9 В, драйвер 0,85 Ом, заряд до конца плато 36 нКл: с 13,32 Ом — 14,17 Ом,
// 5,1/14,17 = 0,3599 А, 36 нКл/0,3599 А = 100 нс; с 15 Ом — 5,1/15,85 = 0,3218 А, 111,9 нс (в статье — 112 нс).
await calculateWithout("rezistor-zatvora-mosfet.html", { von: "15", rg: "15", rgi: "0", vpl: "9,9", qgd: "36", qgs2: "", qg: "50", vth: "5" }, ["Ток затвора на плато Миллера: включение / выключение321,8 мА / 645 мА", "Длительность плато Qgd / Iз: включение / выключение111,9 нс / 55,82 нс"], ["Время переключения (Qgs2"]);
await calculate("rezistor-zatvora-mosfet.html", { von: "15", rg: "13,32", rgi: "0", vpl: "9,9", qgd: "36", qgs2: "", qg: "50", vth: "5" }, ["Сопротивление цепи затвора: включение / выключение14,17 / 13,67 Ом", "Длительность плато Qgd / Iз: включение / выключение100 нс / 49,71 нс"]);
// Рискованный вердикт: 26 В/нс → 10 пФ·26 В/нс·11,35 Ом = 2,951 В ≥ 2,4 В — «Риск ложного включения», без «Оценки».
// Без нормированного порога: при 25 °C 2,27 В < 3 В — только «Недостаточно данных», а 30 В/нс → 3,405 В ≥ 3 В — риск уже при 25 °C.
await calculateWithout("rezistor-zatvora-mosfet.html", { dvdt: "26" }, ["Сопротивление цепи затвора: включение / выключение11,85 / 11,35 Ом", "Ток затвора в начале фронта: включение / выключение1,013 А / 1,057 А", "Ток затвора на плато Миллера: включение / выключение590,7 мА / 440,5 мА", "Длительность плато Qgd / Iз: включение / выключение33,86 нс / 45,4 нс", "Время переключения (Qgs2 + Qgd) / Iз: включение / выключение42,32 нс / 56,75 нс", "Мощность драйвера Qg·(Vвкл − Vвыкл)·fsw72 мВт, средний ток от источника Qg·fsw — 6 мА", "Из неё: в драйвере / во внешних резисторах / во внутреннем Rg ключа3,692 мВт / 62,1 мВт / 6,21 мВт", "Наведённое напряжение ΔVgs ≈ Crss·dv/dt·Rэкв2,951 В при Rэкв = 11,35 Ом", "Наибольшая dv/dt без ложного включения21,15 В/нс", "Наибольший внешний резистор цепи выключения по условию ложного включения7,881 Ом", "СтатусРиск ложного включения: наведённое напряжение ΔVgs ≈ 2,951 В не ниже порога при нагреве 2,4 В"], ["Оценка"]);
await calculateWithout("rezistor-zatvora-mosfet.html", { kth: "" }, ["Сопротивление цепи затвора: включение / выключение11,85 / 11,35 Ом", "Ток затвора в начале фронта: включение / выключение1,013 А / 1,057 А", "Ток затвора на плато Миллера: включение / выключение590,7 мА / 440,5 мА", "Длительность плато Qgd / Iз: включение / выключение33,86 нс / 45,4 нс", "Время переключения (Qgs2 + Qgd) / Iз: включение / выключение42,32 нс / 56,75 нс", "Мощность драйвера Qg·(Vвкл − Vвыкл)·fsw72 мВт, средний ток от источника Qg·fsw — 6 мА", "Из неё: в драйвере / во внешних резисторах / во внутреннем Rg ключа3,692 мВт / 62,1 мВт / 6,21 мВт", "Наведённое напряжение ΔVgs ≈ Crss·dv/dt·Rэкв2,27 В при Rэкв = 11,35 Ом", "СтатусНедостаточно данных: порог при рабочей температуре не задан; при 25 °C наведённое напряжение ΔVgs ≈ 2,27 В ниже порога 3 В, но с нагревом порог снижается"], ["Оценка", "Наибольшая dv/dt"]);
await calculateWithout("rezistor-zatvora-mosfet.html", { kth: "", dvdt: "30" }, ["Сопротивление цепи затвора: включение / выключение11,85 / 11,35 Ом", "Ток затвора в начале фронта: включение / выключение1,013 А / 1,057 А", "Ток затвора на плато Миллера: включение / выключение590,7 мА / 440,5 мА", "Длительность плато Qgd / Iз: включение / выключение33,86 нс / 45,4 нс", "Время переключения (Qgs2 + Qgd) / Iз: включение / выключение42,32 нс / 56,75 нс", "Мощность драйвера Qg·(Vвкл − Vвыкл)·fsw72 мВт, средний ток от источника Qg·fsw — 6 мА", "Из неё: в драйвере / во внешних резисторах / во внутреннем Rg ключа3,692 мВт / 62,1 мВт / 6,21 мВт", "Наведённое напряжение ΔVgs ≈ Crss·dv/dt·Rэкв3,405 В при Rэкв = 11,35 Ом", "СтатусРиск ложного включения: наведённое напряжение ΔVgs ≈ 3,405 В не ниже порога при 25 °C 3 В"], ["Недостаточно"]);
// Отрицательное смещение −4 В: ток выключения (5 + 4)/11,35 = 793 мА, перепад 16 В — 96 мВт, запас до порога 2,4 + 4 = 6,4 В.
// Раздельные резисторы: Rвыкл = 0,35 + 4,7 + 1 = 6,05 Ом, ΔVgs = 10 пФ·20 В/нс·6,05 Ом = 1,21 В.
// Rgs = 10 кОм: затвор 12·10000/10010,85 = 11,99 В, 1,199 мА, 14,37 мВт; Rэкв = 1 + 10,35·10000/10010,35 = 11,34 Ом.
await calculate("rezistor-zatvora-mosfet.html", { voff: "-4" }, ["Сопротивление цепи затвора: включение / выключение11,85 / 11,35 Ом", "Ток затвора в начале фронта: включение / выключение1,35 А / 1,41 А", "Ток затвора на плато Миллера: включение / выключение590,7 мА / 793 мА", "Длительность плато Qgd / Iз: включение / выключение33,86 нс / 25,22 нс", "Время переключения (Qgs2 + Qgd) / Iз: включение / выключение42,32 нс / 31,53 нс", "Мощность драйвера Qg·(Vвкл − Vвыкл)·fsw96 мВт, средний ток от источника Qg·fsw — 6 мА", "Из неё: в драйвере / во внешних резисторах / во внутреннем Rg ключа4,923 мВт / 82,8 мВт / 8,28 мВт", "Наведённое напряжение ΔVgs ≈ Crss·dv/dt·Rэкв2,27 В при Rэкв = 11,35 Ом", "Наибольшая dv/dt без ложного включения56,39 В/нс", "Наибольший внешний резистор цепи выключения по условию ложного включения30,65 Ом", "СтатусОценка: наведённое напряжение ΔVgs ≈ 2,27 В ниже запаса до порога Vth − Vвыкл при нагреве 6,4 В"]);
await calculate("rezistor-zatvora-mosfet.html", { rgmode: "two", rgon: "10", rgoff: "4,7" }, ["Сопротивление цепи затвора: включение / выключение11,85 / 6,05 Ом", "Ток затвора в начале фронта: включение / выключение1,013 А / 1,983 А", "Ток затвора на плато Миллера: включение / выключение590,7 мА / 826,4 мА", "Длительность плато Qgd / Iз: включение / выключение33,86 нс / 24,2 нс", "Время переключения (Qgs2 + Qgd) / Iз: включение / выключение42,32 нс / 30,25 нс", "Мощность драйвера Qg·(Vвкл − Vвыкл)·fsw72 мВт, средний ток от источника Qg·fsw — 6 мА", "Из неё: в драйвере / во внешних резисторах / во внутреннем Rg ключа4,665 мВт / 58,35 мВт / 8,988 мВт", "Наведённое напряжение ΔVgs ≈ Crss·dv/dt·Rэкв1,21 В при Rэкв = 6,05 Ом", "Наибольшая dv/dt без ложного включения39,67 В/нс", "Наибольший внешний резистор цепи выключения по условию ложного включения10,65 Ом", "СтатусОценка: наведённое напряжение ΔVgs ≈ 1,21 В ниже порога при нагреве 2,4 В"]);
await calculate("rezistor-zatvora-mosfet.html", { rgs: "10" }, ["Сопротивление цепи затвора: включение / выключение11,85 / 11,35 Ом", "С Rgs затвор видит эквивалентный источник: включение / выключение11,99 В через 11,84 Ом / 0 В через 11,34 Ом", "Ток затвора в начале фронта: включение / выключение1,013 А / 1,057 А", "Ток затвора на плато Миллера: включение / выключение590,2 мА / 440,9 мА", "Длительность плато Qgd / Iз: включение / выключение33,89 нс / 45,36 нс", "Время переключения (Qgs2 + Qgd) / Iз: включение / выключение42,36 нс / 56,7 нс", "Мощность драйвера Qg·(Vвкл − Vвыкл)·fsw72 мВт, средний ток от источника Qg·fsw — 6 мА", "Из неё: в драйвере / во внешних резисторах / во внутреннем Rg ключа3,692 мВт / 62,1 мВт / 6,21 мВт", "Напряжение на затворе открытого ключа с Rgs11,99 В из 12 В", "Ток и мощность Rgs при открытом ключе1,199 мА, 14,37 мВт", "Наведённое напряжение ΔVgs ≈ Crss·dv/dt·Rэкв2,268 В при Rэкв = 11,34 Ом", "Наибольшая dv/dt без ложного включения21,17 В/нс", "Наибольший внешний резистор цепи выключения по условию ложного включения10,66 Ом", "СтатусОценка: наведённое напряжение ΔVgs ≈ 2,268 В ниже порога при нагреве 2,4 В"]);
// Границы: ΔVgs = 10 пФ·24 В/нс·10 Ом = 2,4 В ровно на пороге — риск; 23,99 В/нс → 2,399 В — «Оценка», число не
// округлено через порог; Rgs = 10 Ом меньше предела 11 Ом — внешний резистор этим условием не ограничен; 300 В/нс — предела нет.
await calculateWithout("rezistor-zatvora-mosfet.html", { rsnk: "0", rgi: "0", dvdt: "24" }, ["СтатусРиск ложного включения: наведённое напряжение ΔVgs ≈ 2,4 В не ниже порога при нагреве 2,4 В"], ["Оценка"], "boundary");
await calculateWithout("rezistor-zatvora-mosfet.html", { rsnk: "0", rgi: "0", dvdt: "23,99" }, ["СтатусОценка: наведённое напряжение ΔVgs ≈ 2,399 В ниже порога при нагреве 2,4 В"], ["Риск"], "boundary");
await calculate("rezistor-zatvora-mosfet.html", { rgs: "0,01" }, ["Наибольший внешний резистор цепи выключения по условию ложного включенияне ограничен этим условием"], "boundary");
await calculate("rezistor-zatvora-mosfet.html", { dvdt: "300" }, ["Наибольший внешний резистор цепи выключения по условию ложного включениянет: даже без внешнего резистора наведённое напряжение не ниже порога", "СтатусРиск ложного включения: наведённое напряжение ΔVgs ≈ 34,05 В не ниже порога при нагреве 2,4 В"], "boundary");
await calculate("rezistor-zatvora-mosfet.html", { kth: "1" }, ["Порог для сравнения — Vth min при наибольшей Tj3 В"], "boundary");
await calculate("rezistor-zatvora-mosfet.html", { qg: "25,01" }, ["Мощность драйвера Qg·(Vвкл − Vвыкл)·fsw30,01 мВт"], "boundary");
await invalid("rezistor-zatvora-mosfet.html", { qg: "25" }, "Полный заряд затвора Qg должен быть больше Qgd + Qgs2");
await invalid("rezistor-zatvora-mosfet.html", { von: "12 В" }, "Заполните числами напряжения и сопротивления драйвера");
await invalid("rezistor-zatvora-mosfet.html", { voff: "0,5" }, "Напряжение выключения — 0 В или отрицательное");
await invalid("rezistor-zatvora-mosfet.html", { vth: "0" }, "Пороговое напряжение должно быть больше нуля");
await invalid("rezistor-zatvora-mosfet.html", { vpl: "3" }, "Напряжение плато должно быть выше порогового напряжения");
await invalid("rezistor-zatvora-mosfet.html", { von: "5" }, "Напряжение включения драйвера должно быть выше напряжения плато");
await invalid("rezistor-zatvora-mosfet.html", { qgd: "0" }, "Qgd, Qg, частота, Crss и dv/dt должны быть больше нуля");
await invalid("rezistor-zatvora-mosfet.html", { qgs2: "-1" }, "Qgs2 не может быть отрицательным");
await invalid("rezistor-zatvora-mosfet.html", { kth: "1,01" }, "Нормированный порог при нагреве — больше 0 и не больше 1");
await invalid("rezistor-zatvora-mosfet.html", { kth: "0" }, "Нормированный порог при нагреве — больше 0 и не больше 1");
await invalid("rezistor-zatvora-mosfet.html", { rgs: "0" }, "Резистор затвор–исток должен быть больше нуля");
await invalid("rezistor-zatvora-mosfet.html", { rgs: "abc" }, "Резистор затвор–исток — число в килоомах");
await invalid("rezistor-zatvora-mosfet.html", { rsrc: "-1" }, "Сопротивления не могут быть отрицательными");
await invalid("rezistor-zatvora-mosfet.html", { rsrc: "0", rg: "0", rgi: "0" }, "Суммарное сопротивление цепи затвора должно быть больше нуля");
await invalid("rezistor-zatvora-mosfet.html", { rgmode: "two", rgoff: "" }, "Введите внешние резисторы цепей включения и выключения");

// Структурные проверки партии №5: запрещённые формы вердикта, карточка
// источника, реестр, каталог, видимость полей по режиму (правило 7), ссылки на
// соседние страницы вместо дублирования, входящие ссылки, безопасность текста:
// изоляция прямо названа неучтённой, советов работать под напряжением и
// оставлять затвор без цепи к истоку нет, номинал Rgs не подставляется.
{
  kind = "structural";
  const batch5 = ["poteri-buck-preobrazovatelya", "nagrev-mosfet", "rezistor-zatvora-mosfet"];
  const read = file => fs.readFileSync(path.join(sourceDir, file), "utf8");
  const visible = file => read(file).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const registry = read("ENGINEERING_AUDIT.md");
  const catalog = read("index.html");
  for (const slug of batch5) {
    const html = read(`${slug}.html`);
    const text = visible(`${slug}.html`);
    const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1] ?? "";
    check(!/проходит|безопасн|соответствует норм/i.test(text) && !/проходит|безопасн|соответствует норм/i.test(script),
      `${slug}: запрещённые слова «проходит», «безопасно», «соответствует нормам»`);
    const card = html.match(/<section class="src">([\s\S]*?)<\/section>/)?.[1] ?? "";
    check(card.includes("Оценка, не нормативный вердикт") && card.includes("Границы применимости") && card.includes("Допущения")
      && card.includes("Редакция") && /обращение 01\.10\.2026/.test(card) && !/Проверил:/.test(card),
      `${slug}: карточка источника без статуса, допущений, границ, редакции или даты обращения — либо с выдуманным проверяющим`);
    check(registry.includes(`\`${slug}\``), `ENGINEERING_AUDIT.md: нет записи о ${slug}`);
    check(catalog.includes(`href="${slug}.html"`), `index.html: ${slug} нет в каталоге`);
    check(/[Ии]золяци[юя][^.]{0,80}не считает/.test(text), `${slug}: не сказано прямо, что изоляцию калькулятор не считает`);
    // Совет работать под напряжением или оставить затвор без цепи — только с отрицанием в том же предложении.
    for (const pattern of [/(работайте|можно работать|измеряйте|прикасайтесь)[^.]{0,40}под напряжением/gi, /затвор[^.]{0,40}(неподключ|без цепи|плавающ)/gi]) {
      for (const hit of text.matchAll(pattern)) {
        const from = text.lastIndexOf(".", hit.index) + 1;
        const to = text.indexOf(".", hit.index + hit[0].length);
        const sentence = text.slice(from, to === -1 ? text.length : to + 1);
        check(/(^|[\s(«"])(не|нельзя)\s/i.test(sentence), `${slug}: опасный совет без отрицания: «${sentence.trim().slice(0, 140)}»`);
      }
    }
  }
  // Каждый переключатель влияет на расчёт (эталоны выше), ненужные поля скрыты.
  const state = async (file, values) => {
    const dom = await load(file); const d = dom.window.document;
    for (const [id, v] of Object.entries(values)) { const el = d.getElementById(id); el.value = v; el.dispatchEvent(new dom.window.Event("change", { bubbles: true })); }
    const hidden = new Set([...d.querySelectorAll(".f")].filter(f => f.style.display === "none").map(f => f.id.replace(/^f_/, "")));
    dom.window.close(); return hidden;
  };
  let hs = await state("poteri-buck-preobrazovatelya.html", {});
  check(["di", "vfd", "tr", "tf"].every(id => hs.has(id)) && !["rl", "qgl", "vsd", "tdt", "l", "qgs2", "qgd", "vpl", "rgon", "rgoff"].some(id => hs.has(id)),
    "poteri-buck-preobrazovatelya: в синхронном режиме по L и по зарядам видны только их поля");
  hs = await state("poteri-buck-preobrazovatelya.html", { top: "diode", rip: "di", sw: "t" });
  check(["rl", "qgl", "vsd", "tdt", "l", "qgs2", "qgd", "vpl", "rgon", "rgoff"].every(id => hs.has(id)) && !["vfd", "di", "tr", "tf"].some(id => hs.has(id)),
    "poteri-buck-preobrazovatelya: режимы «с диодом», «ΔI задан» и «времена фронтов» показывают свои поля");
  hs = await state("nagrev-mosfet.html", {});
  check(hs.has("rja") && !["rjc", "rcs", "rsa"].some(id => hs.has(id)), "nagrev-mosfet: в режиме радиатора поле Rθja скрыто");
  hs = await state("nagrev-mosfet.html", { path: "ja" });
  check(!hs.has("rja") && ["rjc", "rcs", "rsa"].every(id => hs.has(id)), "nagrev-mosfet: в режиме Rθja поля радиатора скрыты");
  hs = await state("rezistor-zatvora-mosfet.html", {});
  check(hs.has("rgon") && hs.has("rgoff") && !hs.has("rg"), "rezistor-zatvora-mosfet: при одном резисторе раздельные скрыты");
  hs = await state("rezistor-zatvora-mosfet.html", { rgmode: "two" });
  check(!hs.has("rgon") && !hs.has("rgoff") && hs.has("rg"), "rezistor-zatvora-mosfet: при раздельных резисторах общий скрыт");
  // Не дублировать соседние страницы, а ссылаться на них.
  const links = { "poteri-buck-preobrazovatelya": ["buck-boost-duty", "drossel-impulsnogo", "nagrev-mosfet", "rezistor-zatvora-mosfet"],
    "nagrev-mosfet": ["raschet-radiatora", "poteri-buck-preobrazovatelya"],
    "rezistor-zatvora-mosfet": ["poteri-buck-preobrazovatelya", "nagrev-mosfet", "bazovyy-rezistor-tranzistora"] };
  for (const [from, list] of Object.entries(links)) {
    const article = read(`${from}.html`).match(/<p class="intro">[\s\S]*?<section class="related">/)?.[0] ?? "";
    for (const to of list) check(article.includes(`href="${to}.html"`), `${from}: в тексте нет ссылки на ${to}`);
  }
  // Входящие ссылки на новые страницы из «Смотрите также» существующих.
  const inbound = [["buck-boost-duty", "poteri-buck-preobrazovatelya"], ["raschet-radiatora", "nagrev-mosfet"], ["linear-regulator-loss", "nagrev-mosfet"],
    ["bazovyy-rezistor-tranzistora", "rezistor-zatvora-mosfet"]];
  for (const [from, to] of inbound) {
    const block = read(`${from}.html`).match(/<section class="related">([\s\S]*?)<\/section>/)?.[1] ?? "";
    check(block.includes(`href="${to}.html"`), `${from}: в «Смотрите также» нет ссылки на ${to}`);
  }
  // Смысловые проверки: источник назван там, где ему приписана формула; паспортные величины не подставляются.
  const buckText = visible("poteri-buck-preobrazovatelya.html");
  check(/SLVA390A/.test(buckText) && /64AN035E/.test(buckText) && /SLVA477B/.test(buckText) && /SLPA009/.test(buckText) && /AN1471/.test(buckText)
    && /не умножает его на температурный множитель повторно/.test(buckText),
    "poteri-buck-preobrazovatelya: формулы не приписаны источникам или нет оговорки о повторном температурном множителе");
  const heatText = visible("nagrev-mosfet.html");
  check(/\(1 \+ α\/100\)/.test(heatText) && /Infineon/.test(heatText) && /AND9016/.test(heatText) && /Риск теплового разгона/.test(heatText)
    && /обратная: там мощность задана/.test(heatText), "nagrev-mosfet: нет модели Infineon, тепловой цепи onsemi или отличия от расчёта радиатора");
  const gateText = visible("rezistor-zatvora-mosfet.html");
  check(/AN90059/.test(gateText) && /UCC21520/.test(gateText) && /SLUA618/.test(gateText) && /Не оставляйте затвор без цепи к истоку/.test(gateText)
    && /номинал не советует/.test(gateText), "rezistor-zatvora-mosfet: нет источников, предупреждения о затворе или оговорки о номинале Rgs");
  // Необязательные поля пустые — результат остаётся полезным: есть статус, нет прочерков вместо чисел.
  // Прочерк fmt()/si() для нечислового значения прилипает к подписи («потерь—»); в нормальном выводе тире всегда с пробелом.
  for (const [file, values] of [["poteri-buck-preobrazovatelya.html", {}], ["poteri-buck-preobrazovatelya.html", { cossl: "", qrr: "", dcr: "", pcore: "", iq: "" }],
    ["nagrev-mosfet.html", { psw: "", tjmax: "" }], ["rezistor-zatvora-mosfet.html", { qgs2: "", kth: "", rgs: "" }]]) {
    const dom = await load(file); const d = dom.window.document;
    for (const [id, v] of Object.entries(values)) { const el = d.getElementById(id); el.value = v; el.dispatchEvent(new dom.window.Event("change", { bubbles: true })); }
    d.getElementById("go").click();
    const res = d.getElementById("res").textContent.replace(/\s+/g, " ");
    check(/Статус/.test(res) && !/\S—/.test(res) && !/NaN|undefined|Infinity/.test(res),
      `${file}: при пустых необязательных полях ${JSON.stringify(values)} нет статуса или есть прочерк вместо числа: «${res.slice(0, 200)}»`);
    dom.window.close();
  }
  const gateDom = await load("rezistor-zatvora-mosfet.html");
  check(gateDom.window.document.getElementById("rgs").value === "", "rezistor-zatvora-mosfet: номинал Rgs не должен подставляться по умолчанию");
  gateDom.window.close();
}


// ===========================================================================
// --- Партия №5: сверка при интеграции ---
// Время выключения по току плато занижено: на интервале Qgs2 затвор разряжается от плато к порогу, ток меньше.
// Примечание не должно утверждать обратное для выключения (раньше — «время чуть меньше» без оговорки).
await calculateWithout("poteri-buck-preobrazovatelya.html", {}, ["при выключении наоборот: затвор разряжается от плато к порогу", "время выключения, а с ним потери выключения, оценка занижает"], ["за время Qgs2 немного больше, чем на плато, и время чуть меньше. Coss"], "structural");
await calculateWithout("rezistor-zatvora-mosfet.html", {}, ["при выключении затвор на интервале Qgs2 разряжается от плато к порогу, ток там меньше, и время выключения больше оценки"], [], "structural");
await calculateWithout("rezistor-zatvora-mosfet.html", { qgs2: "" }, ["Статус"], ["время выключения больше оценки"], "structural");

// --- Партия №5: независимая проверка — выжившие мутации и исправления ---
// Строка для расчёта нагрева верхнего ключа включает обратное восстановление (мутация M13):
// переключение 153,3 мВт + Coss 32,4 мВт + Qrr 10 нКл·12 В·500 кГц = 60 мВт → 245,7 мВт; без Qrr — 185,7 мВт; Iд = √(0,2826·25,18) = 2,668 А.
await calculate("poteri-buck-preobrazovatelya.html", { qrr: "10" }, ["Верхний ключ — для расчёта нагреваIд = 2,668 А, потери, не зависящие от Rds(on), — 245,7 мВт"]);
await calculate("poteri-buck-preobrazovatelya.html", {}, ["Верхний ключ — для расчёта нагреваIд = 2,668 А, потери, не зависящие от Rds(on), — 185,7 мВт"]);
// Делитель Rgs при открытом ключе — без внутреннего Rg, ток через него не течёт (мутация M23): 12·100/(100 + 0,85 + 10) = 10,83 В,
// ток 108,3 мА, мощность 1,172 Вт; при двуполярном драйвере закрытый затвор: −5·100/(100 + 0,35 + 10) = −4,531 В (мутация M24).
await calculate("rezistor-zatvora-mosfet.html", { rgs: "0,1" }, ["Напряжение на затворе открытого ключа с Rgs10,83 В из 12 В", "Ток и мощность Rgs при открытом ключе108,3 мА, 1,172 Вт"]);
await calculate("rezistor-zatvora-mosfet.html", { voff: "-5", rgs: "0,1" }, ["Напряжение на затворе закрытого ключа с Rgs Vз,выкл-4,531 В из -5 В"]);
// P3: k2 = 1, 40 А, 80 мОм, Rθja 40 °C/Вт, 2 Вт: Tj = 40 + 40·(2 + 1600·0,08) = 5240 °C — недопустимый режим, а не «Недостаточно данных».
await calculate("nagrev-mosfet.html", { irms: "40", r25: "80", k2: "1", path: "ja", rja: "40", psw: "2", tjmax: "" }, ["СтатусРасчётная температура кристалла 5240 °C выше 250 °C"]);
// P3: двоичная арифметика при выборе сечения — 5600 Вт, 35 В = Uмин, КПД 100 %, 1 м, 1 % → 0,035·160/0,35 = 16 мм² (в JS 16,000000000000004)
// — выбирается 16 мм², а не 25; 1400 Вт → 4 мм², а не 6.
await calculate("raschet-invertora.html", { p: "5600", cos: "1", zap: "1", ub: "35", umin: "35", eff: "100", l: "1", drop: "1" }, ["Минимум только по падению напряжения16 мм²", "Следующее сечение для проверки16 мм²"], "boundary");
await calculate("raschet-invertora.html", { p: "1400", cos: "1", zap: "1", ub: "35", umin: "35", eff: "100", l: "1", drop: "1" }, ["Минимум только по падению напряжения4 мм²", "Следующее сечение для проверки4 мм²"], "boundary");
// P3: допуск сравнения 10⁻⁹ согласован с выводом — при вводе с 16 значащими цифрами число у порога не показывается равным порогу
// при противоположном вердикте.
await calculate("rezistor-zatvora-mosfet.html", { dvdt: "21,14537444930749" }, ["СтатусРиск ложного включения"], "boundary");
await calculateWithout("transformator-flyback.html", { vdss: "642,8571428565" }, ["СтатусОценка", "70 % от VDSS"], ["70,0000000001"], "boundary");

// --- Партия №5: второй отзыв бота-ревьюера к PR #25 ---
// Эталоны — независимая модель scratchpad b5fix2/ref_gate.py: узловые уравнения цепи затвора
// (закон токов Кирхгофа), пределы — делением отрезка по абсолютному напряжению на затворе.
// (а) Rgs нагружает драйвер: 5 Ом — затвор открытого ключа 12·5/(5 + 10,85) = 3,785 В ниже плато 5 В → ошибка, а не 590,7 мА.
await invalid("rezistor-zatvora-mosfet.html", { rgs: "0,005" }, "напряжение на затворе открытого ключа 3,785 В не выше напряжения плато 5 В");
// Граница: Rgs = 5·10,85/7 = 7,75 Ом даёт ровно 5 В — ошибка; 7,7 Ом — 4,981 В; 7,8 Ом — 5,019 В, ток плато 3,389 мА.
await invalid("rezistor-zatvora-mosfet.html", { rgs: "0,00775" }, "напряжение на затворе открытого ключа 5 В не выше напряжения плато 5 В");
await invalid("rezistor-zatvora-mosfet.html", { rgs: "0,0077" }, "напряжение на затворе открытого ключа 4,981 В не выше");
await calculate("rezistor-zatvora-mosfet.html", { rgs: "0,0078" }, ["С Rgs затвор видит эквивалентный источник: включение / выключение5,019 В через 5,538 Ом / 0 В через 5,448 Ом", "Ток затвора в начале фронта: включение / выключение906,3 мА / 921,2 мА", "Ток затвора на плато Миллера: включение / выключение3,389 мА / 917,8 мА", "Длительность плато Qgd / Iз: включение / выключение5,902 мкс / 21,79 нс", "Время переключения (Qgs2 + Qgd) / Iз: включение / выключение7,377 мкс / 27,24 нс"], "boundary");
// (б) Пример бота: Vвыкл = −5 В, Rgs = 10 Ом, 100 В/нс. Закрытый затвор −5·10/(10 + 10,35) = −2,457 В,
// ΔVgs = 10 пФ·100 В/нс·6,086 Ом = 6,086 В, затвор доходит до 3,629 В > 2,4 В — риск; запас 2,4 + 2,457 = 4,857 В, а не 7,4 В.
await calculateWithout("rezistor-zatvora-mosfet.html", { voff: "-5", rgs: "0,01", dvdt: "100" }, ["С Rgs затвор видит эквивалентный источник: включение / выключение5,755 В через 6,204 Ом / -2,457 В через 6,086 Ом", "Ток затвора в начале фронта: включение / выключение1,324 А / 1,349 А", "Ток затвора на плато Миллера: включение / выключение121,8 мА / 1,225 А", "Длительность плато Qgd / Iз: включение / выключение164,3 нс / 16,32 нс", "Время переключения (Qgs2 + Qgd) / Iз: включение / выключение205,3 нс / 20,4 нс", "Напряжение на затворе закрытого ключа с Rgs Vз,выкл-2,457 В из -5 В", "Наведённое напряжение ΔVgs ≈ Crss·dv/dt·Rэкв6,086 В при Rэкв = 6,086 Ом", "Порог для сравнения — Vth min при наибольшей Tj2,4 В; запас до порога от напряжения закрытого затвора -2,457 В — 4,857 В", "Наибольшая dv/dt без ложного включения79,81 В/нс", "Наибольший внешний резистор цепи выключения по условию ложного включения7,092 Ом", "СтатусРиск ложного включения: наведённое напряжение ΔVgs ≈ 6,086 В не ниже запаса до порога Vth − Vз,выкл при нагреве 4,857 В"], ["Оценка", "7,4 В"]);
// Граница по dv/dt для того же случая: 79,8 В/нс — затвор 2,3996 В, оценка; 79,81 В/нс — 2,4002 В, риск.
// ΔVgs = 0,798·6,086 = 4,85662 и 0,7981·6,086 = 4,85723 В против запаса 4,85700 В: в четыре цифры оба — «4,857»,
// поэтому fx добавляет пятую, чтобы вывод не читался как «4,857 ниже 4,857».
await calculate("rezistor-zatvora-mosfet.html", { voff: "-5", rgs: "0,01", dvdt: "79,8" }, ["СтатусОценка: наведённое напряжение ΔVgs ≈ 4,8566 В ниже запаса до порога Vth − Vз,выкл при нагреве 4,857 В"], "boundary");
await calculate("rezistor-zatvora-mosfet.html", { voff: "-5", rgs: "0,01", dvdt: "79,81" }, ["СтатусРиск ложного включения: наведённое напряжение ΔVgs ≈ 4,8572 В не ниже запаса до порога Vth − Vз,выкл при нагреве 4,857 В"], "boundary");
// Наибольший резистор выключения с Rgs и смещением зависит от делителя: Rgs = 50 Ом, −5 В — 11,71 Ом при 60 В/нс и 19,09 Ом при 40 В/нс
// (прежняя формула с неделённым Vвыкл дала бы 14,3 Ом при 60 В/нс).
await calculate("rezistor-zatvora-mosfet.html", { voff: "-5", rgs: "0,05", dvdt: "60" }, ["С Rgs затвор видит эквивалентный источник: включение / выключение9,86 В через 9,915 Ом / -4,143 В через 9,575 Ом", "Ток затвора на плато Миллера: включение / выключение490,2 мА / 954,8 мА", "Наведённое напряжение ΔVgs ≈ Crss·dv/dt·Rэкв5,745 В при Rэкв = 9,575 Ом", "Наибольшая dv/dt без ложного включения68,33 В/нс", "Наибольший внешний резистор цепи выключения по условию ложного включения11,71 Ом", "СтатусОценка: наведённое напряжение ΔVgs ≈ 5,745 В ниже запаса до порога Vth − Vз,выкл при нагреве 6,543 В"]);
await calculate("rezistor-zatvora-mosfet.html", { voff: "-5", rgs: "0,05", dvdt: "40" }, ["Наибольший внешний резистор цепи выключения по условию ложного включения19,09 Ом"]);
await calculate("rezistor-zatvora-mosfet.html", { voff: "-5", rgs: "0,1" }, ["Ток затвора на плато Миллера: включение / выключение540 мА / 918,3 мА", "Наибольшая dv/dt без ложного включения66,78 В/нс", "Наибольший внешний резистор цепи выключения по условию ложного включения40,1 Ом"]);

// --- Партия №5: третий отзыв бота-ревьюера к PR #25 ---
// (а) buck: в два мёртвых времени ток идёт через внутренний диод, канал нижнего ключа проводит D2 = 1 − D − 2·tм·fsw,
// а в равенстве вольт-секунд на это время стоит Vsd. Эталоны строк — формулы, записанные заново (scratchpad b5fix3/ref_buck3.py);
// физика сверена моделированием тока дросселя во времени с точными экспонентами на интервалах (ref_buck_sim.py):
// D — до 3·10⁻⁶, ΔI — до 1,3·10⁻⁵, проводимость нижнего ключа — до 7·10⁻⁴, мёртвое время — до 9·10⁻⁵.
// tм = 300 нс: D = (3,37 + 0,3·0,78)/11,98 = 0,3008, D2 = 1 − 0,3008 − 0,3 = 0,3992, проводимость канала 40,02 мВт
// (моделирование — 40,00 мВт); прежний счёт за всю долю 1 − D давал 72,4 мВт поверх 1,2 Вт мёртвого времени.
await calculate("poteri-buck-preobrazovatelya.html", { tdt: "300" }, ["Коэффициент заполнения D с учётом падений0,3008 (идеальный Vout / Vin = 0,275)", "Действующий ток нижнего ключа — канал, без мёртвого времени3,163 А при доле периода D2 = 1 − D − 2·tм·fsw = 0,3992", "Потери: проводимость нижнего ключа40,02 мВт — 2,18 %", "Потери: мёртвое время1,2 Вт — 65,3 %", "Нижний ключ — для расчёта нагреваIд канала = 3,163 А, внутренний диод в мёртвое время — 1,2 Вт", "КПД89,98 %", "в равенстве вольт-секунд для D на это время стоит Vsd вместо Iout·R2"]);
await calculateWithout("poteri-buck-preobrazovatelya.html", { top: "diode" }, ["Средний ток диода"], ["D2 = 1 − D", "мёртвое время"]);
// (б) диоды: при постоянном токе нагрузки ΔV от напряжения сети не зависит, угол проводимости с ростом амплитуды сужается,
// и токи импульса растут — их считают при +δ. Моделирование моста во времени (жёсткий источник, ref_diode.py) подтверждает
// направление: пик 12,23 → 12,85 А, действующий ток диода 2,03 → 2,08 А при переходе от номинала к +10 %.
// δ = 0 — токи при номинале, как раньше; δ = 20 % — Vp = 16,97·1,2 − 2 = 18,36 В, θ = 27,85°, пик 12,92 А.
await calculateWithout("diody-vypryamitelya.html", { dup: "0" }, ["Амплитуда на конденсаторе Vp = √2·U − 2·Vf14,97 В", "Угол проводимости θ = arccos(1 − ΔV/Vp)30,92° — 1,718 мс из 10 мс", "Пиковый повторяющийся ток диода — оценка11,64 А", "Действующий ток диода — оценка1,97 А", "Действующий ток обмотки √2·Iд — оценка2,786 А", "Ток пульсаций конденсатора (действующий) — оценка2,6 А"], ["при +0 % — оценка", "Токи импульса посчитаны"]);
await calculate("diody-vypryamitelya.html", { dup: "20" }, ["Амплитуда на конденсаторе Vp = √2·U − 2·Vf14,97 В; при +20 % — 18,36 В", "Угол проводимости θ = arccos(1 − ΔV/Vp) при +20 %27,85° — 1,547 мс из 10 мс", "Пиковый повторяющийся ток диода при +20 % — оценка12,92 А", "Действующий ток диода при +20 % — оценка2,076 А", "Действующий ток обмотки √2·Iд при +20 % — оценка2,935 А", "Ток пульсаций конденсатора (действующий) при +20 % — оценка2,76 А", "Размах пульсаций ΔV = I / (fп·C)2,128 В, наименьшее напряжение 12,84 В"]);

// --- Партия №5: четвёртый отзыв бота-ревьюера к PR #25 ---
// При отрицательном Vвыкл Rgs нагружает драйвер и в закрытом состоянии: Vз,выкл = −5·10/(10 + 10,35) = −2,457 В,
// ток 0,2457 А, мощность 2,457²/10 = 0,6037 Вт (пример бота); Rgs = 100 Ом — −4,531 В, 45,31 мА, 0,2053 Вт.
// Эталон — установившееся напряжение закрытого затвора из узловой модели scratchpad b5fix2/ref_gate.py.
await calculate("rezistor-zatvora-mosfet.html", { voff: "-5", rgs: "0,01", dvdt: "100" }, ["Ток и мощность Rgs при открытом ключе575,5 мА, 3,312 Вт", "Ток и мощность Rgs при закрытом ключе245,7 мА, 603,7 мВт", "Средняя мощность Rgs — эти мощности, взвешенные долями периода"]);
await calculate("rezistor-zatvora-mosfet.html", { voff: "-5", rgs: "0,1" }, ["Ток и мощность Rgs при закрытом ключе45,31 мА, 205,3 мВт"]);
await calculateWithout("rezistor-zatvora-mosfet.html", { rgs: "0,1" }, ["Ток и мощность Rgs при открытом ключе108,3 мА, 1,172 Вт"], ["Ток и мощность Rgs при закрытом ключе"]);
// Пятый отзыв бота: пустые потери переключения — неизвестны, а не ноль. Без них Tj = 75,7 °C (итерация T = Ta + Rθ·I²·R25·1,9^((T − 25)/125)
// при 8 А, 20 мОм, 40 °C, 21,5 °C/Вт), но вывод «не больше Tj max» не выдаётся; явный 0 — «Оценка». Превышение Tj max при пустом поле
// (12,083 А → 177,1 °C) остаётся однозначным: с потерями переключения было бы только горячее.
await calculateWithout("nagrev-mosfet.html", { psw: "" }, ["Температура кристалла Tj с ростом Rds(on)75,7 °C", "Потери переключения и прочиене заданы — в расчёте 0", "СтатусНедостаточно данных: потери переключения и прочие не заданы — без них Tj ≈ 75,7 °C не больше Tj max 175 °C, но с ними Tj выше. Если ключ не переключается, введите 0"], ["СтатусОценка"]);
await calculate("nagrev-mosfet.html", { psw: "0" }, ["Потери переключения и прочие0 Вт", "СтатусОценка: Tj ≈ 75,7 °C не больше Tj max 175 °C"]);
await calculate("nagrev-mosfet.html", { psw: "", irms: "12,083" }, ["Температура кристалла Tj с ростом Rds(on)177,1 °C", "СтатусРасчётная температура кристалла 177,1 °C больше Tj max 175 °C"]);
await calculate("nagrev-mosfet.html", { psw: "", tjmax: "" }, ["СтатусНедостаточно данных: Tj max из паспорта не задана, потери переключения и прочие не заданы; оценка Tj ≈ 75,7 °C без этих потерь"]);

// --- Партия №5: шестой отзыв бота-ревьюера к PR #25 ---
// transformator-flyback: округление витков вверх поднимает Vor. Пример бота: Vor = 1 В → 2/13 витков, по виткам 1,923 В.
// При той же Lp = 0,2671 мкГн пиковый ток √(2·28,24/(0,2671 мкГн·65 кГц)) = 57,04 А и D = 0,0099 не меняются, а граница DCM
// для фактического Vor — 0,9699 мкГн (независимо: деление отрезка по Lp, при которой D·T + Lp·Iпик/Vor_факт = T).
// Vor = 80 В → 45/7, по виткам 80,36 В, граница 540,8 мкГн при расчётной 538,1 мкГн. По умолчанию Vor не меняется — строки нет.
await calculate("transformator-flyback.html", { vor: "1" }, ["Пиковый ток первичной обмотки 2·Pвх / (Vвх min·Dmax)57,04 А", "Витки первичной / вторичной обмотки2 / 13 — n = 0,1538, Vor = 1,923 В", "Граница DCM при фактическом Vor = 1,923 ВLp не больше 0,9699 мкГн; при Lp не больше 0,2671 мкГн ток прерывистый с запасом, пиковый ток и Dmax те же — их задают Lp, Pвх и fs", "Округление витков подняло отражённое напряжение до 1,923 В"]);
await calculate("transformator-flyback.html", { vor: "80" }, ["Витки первичной / вторичной обмотки45 / 7 — n = 6,429, Vor = 80,36 В", "Граница DCM при фактическом Vor = 80,36 ВLp не больше 540,8 мкГн; при Lp не больше 538,1 мкГн"]);
await calculateWithout("transformator-flyback.html", {}, ["Витки первичной / вторичной обмотки42 / 7 — n = 6, Vor = 75 В"], ["Граница DCM при фактическом", "Округление витков подняло"]);
// Седьмой отзыв бота: коэффициенты Фурье выпрямленной синусоиды — численным интегрированием методом Симпсона по периоду
// (без замкнутых формул): U = 12 В — постоянная 10,8038 В, амплитуда гармоники 2f 7,20253 В; U = 24 В — 21,6076 и 14,4051 В.
// Ссылки на форум на странице больше нет, Radiotron и ARRL помечены как справка.
await calculate("drosselnyy-filtr-vypryamitelya.html", { us: "12", il: "1" }, ["Постоянная составляющая выпрямленного напряжения 2√2·U/π10,8 В", "Пульсации на входе фильтра: амплитуда гармоники 2f, 4√2·U/(3π)7,203 В на 100 Гц"]);
await calculate("drosselnyy-filtr-vypryamitelya.html", {}, ["Постоянная составляющая выпрямленного напряжения 2√2·U/π21,61 В", "Пульсации на входе фильтра: амплитуда гармоники 2f, 4√2·U/(3π)14,41 В на 100 Гц"]);
{
  kind = "structural";
  const lcHtml = fs.readFileSync(path.join(sourceDir, "drosselnyy-filtr-vypryamitelya.html"), "utf8");
  check(!/diyaudio/i.test(lcHtml), "drosselnyy-filtr-vypryamitelya: осталась ссылка на форум diyAudio");
  check(/элементарные интегралы/.test(lcHtml) && /только для сравнения/.test(lcHtml),
    "drosselnyy-filtr-vypryamitelya: нет вывода коэффициентов Фурье или пометки «только для сравнения» у Radiotron и ARRL");
}

// Девятый отзыв бота: постоянный ток Rgs идёт от источника драйвера через выходное сопротивление драйвера и внешний резистор
// и греет их. Эталон — модифицированный узловой анализ установившегося режима (scratchpad b5fix6/ref_rgs_mna.py, без формулы
// делителя): Rgs = 10 Ом, 12 В — 575,5 мА: в Rgs 3,312 Вт, в драйвере (0,85 Ом) 281,6 мВт, в Rg 3,312 Вт, от источника 6,906 Вт;
// при −5 В — 245,7 мА: 603,7 мВт, 21,13 мВт (0,35 Ом), 603,7 мВт, 1,229 Вт. Баланс: мощность источника равна сумме трёх.
await calculate("rezistor-zatvora-mosfet.html", { voff: "-5", rgs: "0,01", dvdt: "100" }, ["Тот же ток при открытом ключе: мощность в драйвере / в Rg / от источника Vвкл281,6 мВт / 3,312 Вт / 6,906 Вт",
  "Тот же ток при закрытом ключе: мощность в драйвере / в Rg / от источника Vвыкл21,13 мВт / 603,7 мВт / 1,229 Вт",
  "средний ток от источника Qg·fsw — 6 мА; постоянный ток Rgs — сверх них, ниже", "греет и их: от источника берётся V·I"]);
// Rgs = 100 Ом: 108,3 мА — 9,961 мВт / 117,2 мВт / 1,299 Вт; при −5 В 45,31 мА — 718,6 мкВт / 20,53 мВт / 226,6 мВт.
await calculate("rezistor-zatvora-mosfet.html", { voff: "-5", rgs: "0,1" }, ["Тот же ток при открытом ключе: мощность в драйвере / в Rg / от источника Vвкл9,961 мВт / 117,2 мВт / 1,299 Вт",
  "Тот же ток при закрытом ключе: мощность в драйвере / в Rg / от источника Vвыкл718,6 мкВт / 20,53 мВт / 226,6 мВт"]);
// Раздельные резисторы 10 и 4,7 Ом, Rgs = 50 Ом: открыт — 197,2 мА через Rg,вкл (388,9 мВт), закрыт при −5 В — 90,83 мА через Rg,выкл (38,77 мВт).
await calculate("rezistor-zatvora-mosfet.html", { rgmode: "two", voff: "-5", rgs: "0,05" }, ["Тот же ток при открытом ключе: мощность в драйвере / в Rg,вкл / от источника Vвкл33,06 мВт / 388,9 мВт / 2,366 Вт",
  "Тот же ток при закрытом ключе: мощность в драйвере / в Rg,выкл / от источника Vвыкл2,887 мВт / 38,77 мВт / 454,1 мВт"]);
// Обычный Rgs 10 кОм — нагрузка мала: 1,199 мА, в драйвере 1,221 мкВт, в Rg 14,37 мкВт, от источника 14,38 мВт. При Vвыкл = 0 строки закрытого ключа нет.
await calculateWithout("rezistor-zatvora-mosfet.html", { rgs: "10" }, ["Тот же ток при открытом ключе: мощность в драйвере / в Rg / от источника Vвкл1,221 мкВт / 14,37 мкВт / 14,38 мВт"], ["Тот же ток при закрытом ключе"]);
// Без Rgs — ни строк постоянного тока, ни приписки к току от источника.
await calculateWithout("rezistor-zatvora-mosfet.html", {}, ["средний ток от источника Qg·fsw — 6 мА"], ["Тот же ток", "постоянный ток Rgs"]);

// Coverage guard считает фактически выполненные сценарии. Простое load()
// больше не выдаётся за проверку формулы. Минимум один сценарий предотвращает
// полный пропуск; список калькуляторов с одним сценарием печатается отдельно
// и остаётся инженерным долгом, а не скрывается за общим числом assertions.
kind = "structural";
{
  const uncovered = [];
  for (const file of htmlFiles) {
    if (file === "index.html" || noticePages.includes(file)) continue;
    const slug = file.replace(/\.html$/, "");
    if ((scenarioCounts.get(file) ?? 0) === 0) uncovered.push(slug);
  }
  check(uncovered.length === 0,
    `Без функциональных тестов остались калькуляторы (${uncovered.length}): ${uncovered.join(", ")}`);
  if (uncovered.length) {
    console.error(`\nБез функциональных тестов: ${uncovered.length} из ${htmlFiles.length - 1}`);
  }
}

const underTwo = [...scenarioCounts.entries()]
  .filter(([, count]) => count < 2)
  .map(([file]) => file.replace(/\.html$/, ""))
  .sort();

console.log(JSON.stringify({
  checks,
  structural: byKind.structural,
  functional: byKind.functional,
  boundary: byKind.boundary,
  calculatorsCheckedWithInvalidInput: invalidInputChecked.length,
  calculatorsWithOneScenario: underTwo.length,
  oneScenarioSlugs: underTwo,
  failures: failures.length,
}, null, 2));
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
}
