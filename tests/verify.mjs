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
check(htmlFiles.length === 116, `Ожидался 116 HTML-файлов, найдено ${htmlFiles.length}`);

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
  for (const anchor of document.querySelectorAll('a[href$=".html"]')) {
    const target = anchor.getAttribute("href");
    check(fs.existsSync(path.join(sourceDir, target)), `${file}: битая ссылка ${target}`);
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
await calculate("raschet-zazemleniya.html", {}, ["Оценочное сопротивление R20 Ом", "СтатусОценка, требуется измерение"]);
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
await calculate("raschet-invertora.html", { p: "2000", cos: "0,8", zap: "1,3", ub: "24", eff: "90", l: "2" }, ["Ток по стороне аккумулятора92,593 А", "Следующее сечение для проверки16 мм²"]);
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
await calculate("raschet-invertora.html", { p: "1000", cos: "1", zap: "1", ub: "100", eff: "100", l: "1", drop: "1" }, ["Ток по стороне аккумулятора10 А", "Минимум только по падению напряжения0,35 мм²", "Фактические потери в кабеле875 мВт"]);
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
check(sitemapPages.length === 116, `В sitemap должно быть 116 URL (корень + about + 114 калькуляторов), найдено ${sitemapPages.length}`);
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
await calculate("zapolnenie-montazhnoy-korobki.html", { ydev: "12" }, ["нет калибра 12 AWG"], "boundary");
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
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "15", rho: "50", rt: "6,8" }, ["Оценочное сопротивление R ≈ 2ρ/L6,667 Ом", "Возможное занижение формулы (однородный грунт)нет: для контура до 15 м формула скорее завышает R", "не выше заданной цели и с учётом возможного занижения формулы", "скорее завышает сопротивление"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "15,01", rho: "50", rt: "6,8" }, ["Возможное занижение формулы (однородный грунт)до 5 %", "запас меньше возможного занижения — цель не подтверждена"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { a: "12", b: "8", rho: "100", rt: "5,85" }, ["Оценочное сопротивление R ≈ 2ρ/L5 Ом", "Сравнение с целью5 Ом — не выше заданной цели и с учётом возможного занижения формулы"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { a: "12", b: "8", rho: "100", rt: "5,84" }, ["Сравнение с целью5 Ом — оценка не выше цели, но запас меньше возможного занижения — цель не подтверждена"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "150", rho: "100", rt: "5" }, ["Возможное занижение формулы (однородный грунт)до 38 %", "не выше заданной цели и с учётом возможного занижения формулы"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "150,01", rho: "100", rt: "5" }, ["Возможное занижение формулы (однородный грунт)не оценивалось: контур длиннее 150 м", "погрешность формулы для такого контура не оценивалась", "может превышать 38 %"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { a: "30", b: "1", rho: "100", rt: "5" }, ["Длина замкнутого контура L62 м", "Возможное занижение формулы (однородный грунт)не оценивалось: стороны контура длиннее 3:1", "погрешность формулы для такого контура не оценивалась", "длиннее 3:1 занижение формулы больше"]);
await calculate("kolcevoy-zazemlitel.html", { a: "15", b: "5", rho: "100", rt: "10" }, ["Возможное занижение формулы (однородный грунт)до 17 %", "Сравнение с целью5 Ом — не выше заданной цели и с учётом возможного занижения формулы"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { a: "15,01", b: "5", rho: "100", rt: "10" }, ["не оценивалось: стороны контура длиннее 3:1"], "boundary");
await calculate("kolcevoy-zazemlitel.html", { zad: "l", l: "40", rho: "100", rt: "10" }, ["Возможное занижение формулы (однородный грунт)до 17 % — при сторонах не длиннее 3:1", "Поправка рассчитана для контура со сторонами не длиннее 3:1"]);
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

await calculate("rozetochnaya-gruppa.html", { tip: "rozetki", inom: "16", u: "220", cos: "1", p1: "2000", p2: "1200" }, ["Суммарная одновременная мощность3200 Вт", "Расчётный ток IB14,55 А", "Номинал автомата In16 А", "Загрузка от номинала90,91 %", "Условие IB ≤ InВыполняется", "Запас до номинала320 Вт"]);
await calculate("rozetochnaya-gruppa.html", { tip: "rozetki", inom: "16", u: "220", cos: "1", p1: "2000", p2: "1200", p3: "800" }, ["Расчётный ток IB18,18 А", "Загрузка от номинала113,6 %", "Условие IB ≤ InНе выполняется", "Превышение номинала480 Вт"]);
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
