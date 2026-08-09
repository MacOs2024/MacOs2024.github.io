import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(testDir, "..");
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

async function load(file) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => errors.push(error.message));
  virtualConsole.on("error", error => errors.push(String(error)));
  const html = fs.readFileSync(path.join(sourceDir, file), "utf8");
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: `https://example.test/${file}`,
    virtualConsole,
  });
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

async function calculate(file, values, expected) {
  const dom = await load(file);
  const { document } = dom.window;
  setValues(document, values);
  const button = document.getElementById("go");
  check(Boolean(button), `${file}: отсутствует кнопка расчёта`);
  button?.click();
  const result = document.getElementById("res")?.textContent.replace(/\s+/g, " ").trim() ?? "";
  for (const fragment of expected) {
    check(result.includes(fragment), `${file}: ожидалось «${fragment}», получено «${result}»`);
  }
  dom.window.close();
}

// Служебные файлы в корне — не страницы сайта: их не проверяем как калькуляторы,
// но следим, чтобы они не пропали при пересборке.
const serviceFiles = ["yandex_eb993645a776a164.html"];
for (const file of serviceFiles) {
  check(fs.existsSync(path.join(sourceDir, file)), `Отсутствует служебный файл ${file}`);
}

const htmlFiles = fs.readdirSync(sourceDir)
  .filter(file => file.endsWith(".html") && !serviceFiles.includes(file)).sort();
check(htmlFiles.length === 101, `Ожидался 101 HTML-файл, найдено ${htmlFiles.length}`);

for (const file of htmlFiles) {
  const dom = await load(file);
  const { document } = dom.window;
  check(document.documentElement.lang === "ru", `${file}: не указан lang=ru`);
  check(Boolean(document.querySelector("meta[name=viewport]")), `${file}: нет viewport`);
  check(Boolean(document.querySelector("meta[name=description]")?.content.trim()), `${file}: нет meta description`);
  check(Boolean(document.querySelector("h1")), `${file}: нет h1`);
  check(document.querySelector("footer")?.textContent.includes("справочный характер"), `${file}: нет обязательного дисклеймера`);
  const external = [...document.querySelectorAll("script[src],link[rel=stylesheet],img[src]")];
  check(external.every(node => (node.getAttribute("src") || "").startsWith("https://mc.yandex.ru/")), `${file}: найдена неожиданная внешняя зависимость`);
  check(typeof dom.window.ym === "function", `${file}: не инициализирована Яндекс.Метрика`);

  const canonical = document.querySelector('link[rel=canonical]')?.getAttribute("href") ?? "";
  const expected = file === "index.html" ? "https://macos2024.github.io/" : `https://macos2024.github.io/${file}`;
  check(canonical === expected, `${file}: canonical «${canonical}», ожидался «${expected}»`);
  check(Boolean(document.querySelector('meta[property="og:title"]')?.content.trim()), `${file}: нет og:title`);
  check(document.querySelector('meta[property="og:url"]')?.content === expected, `${file}: og:url не совпадает с canonical`);
  const ld = document.querySelector('script[type="application/ld+json"]')?.textContent ?? "";
  let ldParsed = null;
  try { ldParsed = JSON.parse(ld); } catch { /* останется null */ }
  check(ldParsed !== null, `${file}: микроразметка JSON-LD не разбирается как JSON`);
  const ldTypes = (ldParsed?.["@graph"] ?? []).map(node => node["@type"]);
  if (file === "index.html") {
    check(ldTypes.includes("WebSite") && ldTypes.includes("ItemList"), `${file}: в разметке нет WebSite и ItemList`);
  } else {
    check(ldTypes.includes("WebApplication"), `${file}: в разметке нет WebApplication`);
    check(ldTypes.includes("FAQPage"), `${file}: в разметке нет FAQPage`);
    const faqCount = (ldParsed?.["@graph"] ?? []).find(n => n["@type"] === "FAQPage")?.mainEntity?.length ?? 0;
    const visibleFaq = document.querySelectorAll(".faq h3").length;
    check(faqCount === visibleFaq, `${file}: в разметке ${faqCount} вопросов, на странице ${visibleFaq} — они должны совпадать`);
  }
  if (file !== "index.html") {
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

await calculate("zakon-oma.html", { u: "12", i: "", r: "6", p: "" }, ["Ток I2 А", "Мощность P24 Вт"]);
await calculate("moshchnost-toka.html", { i: "10" }, ["Активная мощность P2200 Вт", "Реактивная мощность Q0 вар"]);
await calculate("tok-po-moshchnosti.html", { p: "3500" }, ["Ток I15,9 А"]);

{
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
  const dom = await load("markirovka-rezistorov.html");
  setValues(dom.window.document, { nb: 4, b1: 1, b2: 0, bm: 2, bt: 0 });
  dom.window.document.getElementById("go").click();
  const result = dom.window.document.getElementById("res").textContent.replace(/\s+/g, " ");
  check(result.includes("1 кОм"), `markirovka-rezistorov.html: неверный результат «${result}»`);
  dom.window.close();
}

await calculate("sechenie-kabelya.html", { p: "3,5" }, ["Расчётный ток15,9 А", "Минимальное сечение1,5 мм²"]);
await calculate("padenie-napryazheniya.html", { i: "10", l: "20", s: "1,5" }, ["Падение напряжения ΔU4,67 В", "2,12 %"]);
await calculate("vybor-avtomata.html", { p: "3,5" }, ["Расчётный ток15,9 А", "Автомат16 А"]);
await calculate("vybor-uzo.html", {}, ["Номинальный ток УЗО25 А", "30 мА"]);
await calculate("stoimost-elektroenergii.html", { p: "1000", h: "2", d: "30", t: "5" }, ["Расход за месяц60 кВт·ч", "Стоимость в месяц300 ₽"]);
await calculate("tok-elektrodvigatelya.html", { p: "1,5" }, ["Номинальный ток3,23 А"]);
await calculate("kondensator-dvigatelya.html", { p: "1,1" }, ["Номинальный ток двигателя4,25 А", "Рабочая ёмкость Cраб92,6 мкФ"]);
await calculate("raschet-zazemleniya.html", {}, ["Один электрод R1", "Ом"]);
await calculate("kva-kvt.html", { v: "10", c: "0,8" }, ["10 кВА при cos φ = 0,88 кВт"]);
await calculate("rezistor-svetodioda.html", {}, ["Расчётный резистор500 Ом", "Ближайший из ряда Е24 (вверх)510 Ом"]);
await calculate("energiya-kondensatora.html", { c: "100", u: "400" }, ["Энергия E8 Дж", "Заряд Q40 мКл"]);
await calculate("reaktivnoe-soprotivlenie.html", { f: "50", c: "100", c_unit: "1e-06" }, ["Xc = 1/(2πfC)31,83 Ом"]);
await calculate("rezonans-lc.html", { f: "", l: "10", c: "100" }, ["Резонансная частота f5,033 МГц"]);
await calculate("rc-filtr.html", { r: "10", c: "10", f: "" }, ["Частота среза fc1,592 кГц"]);
await calculate("zaryad-kondensatora.html", { r: "1000", c: "1000" }, ["Постоянная времени τ = R·C1 с", "До 99%4,605 с"]);
await calculate("raschet-transformatora.html", { p2: "100", u2: "12" }, ["Сечение сердечника S12,8 см²", "Первичная обмотка W₁860 витков"]);
await calculate("raschet-radiatora.html", { pw: "30" }, ["не более 0,333 °C/Вт"]);
await calculate("vremya-raboty-akkumulyatora.html", { c: "100", p: "100" }, ["Доступная энергия600 Вт·ч", "≈ 6 ч 0 мин"]);
await calculate("soprotivlenie-provoda.html", { s: "1,5", l: "20", i: "10" }, ["233,3 мОм", "2,33 В", "23,33 Вт"]);
await calculate("ten-moshchnost-tok.html", { u: "220", p: "2" }, ["Рабочий ток I9,0909 А", "Сопротивление R24,2 Ом"]);
await calculate("vremya-nagreva-vody.html", { v: "10", t1: "20", t2: "100", p: "2", eff: "90" }, ["Энергия из сети1,0331 кВт·ч", "31"]);
await calculate("nagrevanie-dzhoulya-lentsa.html", { i: "2", r: "10", t: "60" }, ["Мощность нагрева P40 Вт", "2,4 кДж", "0,66667 Вт·ч"]);
await calculate("delitel-toka.html", { it: "3", r1: "100", r2: "200" }, ["Ток через R₁2 А", "Ток через R₂1 А", "Напряжение на ветвях200 В"]);
await calculate("shunt-ampermetra.html", { im: "1", rm: "100", i: "10" }, ["100 мВ", "10 мОм", "0,9999 Вт"]);
await calculate("dobavochnyy-rezistor-voltmetra.html", { im: "1", rm: "100", u: "100" }, ["Добавочный резистор99,9 кОм", "Полное входное сопротивление100 кОм"]);
await calculate("awg-mm2.html", { awg: "12" }, ["12 AWG", "2,0525 мм", "3,3088 мм²"]);
await calculate("shirina-dorozhki-pcb.html", { i: "1", dt: "10", th: "35" }, ["Расчётная ширина0,30039 мм", "С запасом 25%0,37548 мм"]);
await calculate("ne555-astabilnyy.html", { r1: "10", r2: "100", c: "100" }, ["68,7 Гц", "52,381 %"]);
await calculate("ne555-monostabilnyy.html", { r: "100", c: "10" }, ["1,1 с"]);
await calculate("ten-moshchnost-tok.html", { mode: "r", u: "220", r: "24,2" }, ["Мощность P2000 Вт", "Рабочий ток I9,0909 А"]);
await calculate("awg-mm2.html", { mode: "s", area: "2,5" }, ["13 AWG", "Площадь сечения2,5 мм²"]);
await calculate("shirina-dorozhki-pcb.html", { layer: "int", i: "1", dt: "10", th: "35" }, ["Расчётная ширина0,78144 мм"]);
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
await calculate("tok-korotkogo-zamykaniya.html", { u: "220", z: "0,5", tip: "10", in: "16" }, ["Ток короткого замыкания Iкз440 А", "ВердиктАвтомат сработает"]);
await calculate("dlina-kabelya-po-padeniyu.html", { i: "16", s: "2,5", u: "220", dop: "5" }, ["Максимальная длина линии49,107 м"]);
await calculate("moshchnost-po-schetchiku.html", { k: "3200", n: "10", t: "30", tar: "5" }, ["Мощность нагрузки375 Вт"]);
await calculate("nagruzka-kvartiry.html", { p: "15", kc: "0,5", u: "220", cos: "1" }, ["Расчётный ток34,091 А", "Вводной автомат40 А"]);
await calculate("zapolnenie-truby-kabelem.html", { d: "25", n: "3", dk: "7" }, ["Коэффициент заполнения23,52 %", "Максимум кабелей этого диаметра5 шт."]);
await calculate("teplyy-pol.html", { s: "10", pud: "150", ppog: "20", u: "220" }, ["Длина греющего кабеля75 м", "Шаг укладки13,3 см"]);
await calculate("sechenie-po-dline-12v.html", { i: "10", l: "5", u: "12", dop: "3" }, ["Расчётное сечение4,861 мм²", "Ближайшее стандартное6 мм²"]);
await calculate("batareya-posledovatelno-parallelno.html", { uc: "3,2", cc: "100", ns: "4", np: "2" }, ["Напряжение батареи12,8 В", "Ёмкость батареи200 А·ч"]);
await calculate("perevod-ah-wh.html", { mode: "wh", ah: "100", u: "12" }, ["Энергия1200 Вт·ч"]);
await calculate("perevod-ah-wh.html", { mode: "ah", wh: "1200", u: "12" }, ["Ёмкость100 А·ч"]);
await calculate("zaryadka-elektromobilya.html", { c: "60", s0: "20", s1: "80", p: "7,4", eff: "90", tar: "5" }, ["Взять из сети с учётом КПД40 кВт·ч", "Стоимость зарядки200 ₽"]);
await calculate("moshchnost-nasosa.html", { q: "5", h: "30", ro: "1000", np: "65", nm: "90", u: "220", cos: "0,8" }, ["Гидравлическая мощность408,8 Вт", "Потребляемая из сети698,7 Вт"]);
await calculate("raschet-akb-avtonomnoy.html", { e: "3", d: "2", u: "48", dod: "80", eff: "90" }, ["Требуемая ёмкость173,61 А·ч"]);
await calculate("ou-usilenie.html", { mode: "inv", rin: "1", rf: "10", vin: "0,1", vcc: "12" }, ["Коэффициент усиления-10", "Усиление в децибелах20 дБ"]);
await calculate("ou-usilenie.html", { mode: "non", rin: "1", rf: "10", vin: "0,1", vcc: "12" }, ["Коэффициент усиления11"]);
await calculate("bazovyy-rezistor-tranzistora.html", { vc: "5", vbe: "0,7", ic: "100", hfe: "100", k: "3" }, ["Расчётный резистор Rб1,433 кОм", "Ближайший из ряда Е24 (вниз)1,3 кОм"]);
await calculate("buck-boost-duty.html", { mode: "buck", vin: "12", vout: "5", f: "100" }, ["Коэффициент заполнения D0,41667"]);
await calculate("buck-boost-duty.html", { mode: "boost", vin: "5", vout: "12", f: "100" }, ["Коэффициент заполнения D0,58333"]);
await calculate("drossel-impulsnogo.html", { mode: "buck", vin: "12", vout: "5", f: "100", io: "1", ri: "30" }, ["Требуемая индуктивность L97,22 мкГн", "Пиковый ток дросселя1,15 А"]);
await calculate("shim-srednee-napryazhenie.html", { v: "12", d: "25", r: "10", f: "1" }, ["Действующее напряжение (RMS)6 В", "Мощность в нагрузке3,6 Вт"]);
await calculate("dlina-antenny.html", { mode: "dip", f: "145", k: "0,95" }, ["Полная длина диполя0,982079 м"]);
await calculate("induktivnost-katushki.html", { mode: "l", d: "20", len: "20", n: "20" }, ["Индуктивность в мкГн5,43036 мкГн"]);
await calculate("induktivnost-katushki.html", { mode: "n", d: "20", len: "20", ind: "5,43" }, ["Принять витков20 витков"]);
await calculate("ntc-termistor.html", { mode: "r", r25: "10", b: "3950", t: "50" }, ["Сопротивление термистора3,588 кОм"]);
await calculate("ntc-termistor.html", { mode: "t", r25: "10", b: "3950", r: "3,588" }, ["Температура50,001 °C"]);
await calculate("diametr-provoda-obmotki.html", { mode: "d", i: "2", j: "2,5" }, ["Расчётный диаметр1,0093 мм", "Ближайший стандартный1,06 мм"]);
await calculate("lc-filtr-raschet.html", { fc: "1000", r: "8" }, ["Индуктивность L1,273 мГн", "Ёмкость C19,89 мкФ"]);

// Проверка обработки ошибок в новых калькуляторах
await calculate("soedinenie-kondensatorov.html", { mode: "par", c1: "100", c2: "", c3: "" }, ["минимум два номинала"]);
await calculate("buck-boost-duty.html", { mode: "buck", vin: "5", vout: "12", f: "100" }, ["не может дать выход выше входа"]);
await calculate("zvezda-treugolnik.html", { mode: "star", ul: "380", z: "10", cos: "2" }, ["cos φ должен быть"]);

// Калькуляторы 81–100
await calculate("preobrazovanie-y-delta.html", { mode: "dy", rab: "10", rbc: "20", rca: "30" }, ["Ra (луч к узлу A)5 Ом", "Rc (луч к узлу C)10 Ом"]);
await calculate("preobrazovanie-y-delta.html", { mode: "yd", ra: "5", rb: "3,3333", rc: "10" }, ["R(ab) — между A и B10 Ом", "R(bc) — между B и C20 Ом"]);
await calculate("vnutrennee-soprotivlenie.html", { mode: "xx", e: "12,7", u: "11,8", i: "100" }, ["Внутреннее сопротивление r9 мОм", "Максимальная отдаваемая мощность4,48 кВт"]);
await calculate("koefficient-transformacii.html", { u1: "220", u2: "12", n1: "1100", i2: "5", eff: "100" }, ["Коэффициент трансформации n18,3333", "Число витков вторичной W₂60 витков"]);
await calculate("koefficienty-prokladki.html", { it: "27", n: "0.85", dop: "70", norm: "25", t: "35" }, ["Коэффициент на температуру0,88192", "Допустимый ток с поправками20,24 А"]);
await calculate("raschet-osveshcheniya.html", { e: "150", s: "18", fl: "1200", eta: "0,5", kz: "1,2", z: "1,1" }, ["Требуемый полезный поток3564 лм", "Принять светильников6 шт."]);
await calculate("emkostnyy-tok-utechki.html", { i: "25", l: "80", uzo: "30" }, ["Суммарный ток утечки10,8 мА", "ВердиктПревышение"]);
await calculate("tok-v-nule-perekos.html", { ia: "30", ib: "20", ic: "10", u: "220" }, ["Ток в нулевом проводе I(N)17,321 А"]);
await calculate("tok-v-nule-perekos.html", { ia: "20", ib: "20", ic: "20", u: "220" }, ["Ток в нулевом проводе I(N)0 А"]);
await calculate("sechenie-pe-provodnika.html", { s: "50", tip: "3", mat: "cu" }, ["Принять PE25 мм²"]);
await calculate("sechenie-pe-provodnika.html", { s: "25", tip: "3", mat: "cu" }, ["Принять PE16 мм²"]);
await calculate("prosadka-pri-puske.html", { i: "10", k: "6", l: "30", s: "4", u: "220" }, ["Пусковой ток60 А", "Провал напряжения при пуске15,75 В", "ВердиктПуск обеспечен"]);
await calculate("molniezashchita.html", { h: "12", nad: "0.99", hx: "6" }, ["Высота конуса защиты h₀9,6 м", "Радиус на высоте 6 м3,6 м"]);
await calculate("moshchnost-elektrokotla.html", { v: "150", tin: "22", tout: "-25", k: "1.5", faza: "3", tar: "5" }, ["Расчётная тепловая мощность12,297 кВт", "Ток при 380 В21,485 А"]);
await calculate("raschet-invertora.html", { p: "2000", cos: "0,8", zap: "1,3", ub: "24", eff: "90", l: "2" }, ["Ток по стороне аккумулятора92,593 А", "Принять сечение16 мм²"]);
await calculate("kpd-transformatora.html", { sn: "100", p0: "330", pk: "2270", b: "0,7", cos: "0,9" }, ["КПД при загрузке 0,797,762 %", "Оптимальная загрузка βопт0,38128"]);
await calculate("solnechnye-paneli-massiv.html", { voc: "41,5", vmp: "34,5", beta: "-0,30", tmin: "-30", vmax: "250", n: "5" }, ["Voc массива при -30 °C241,74 В", "ВердиктПроходит"]);
await calculate("solnechnye-paneli-massiv.html", { voc: "41,5", vmp: "34,5", beta: "-0,30", tmin: "-30", vmax: "250", n: "6" }, ["ВердиктПРЕВЫШЕНИЕ"]);
await calculate("stoimost-osveshcheniya.html", { n: "10", h: "5", years: "5", tar: "5", p1: "10", c1: "200", r1: "30000", p2: "75", c2: "30", r2: "1000" }, ["Вариант A: всего6562,5 ₽", "ВыгоднееВариант A"]);
await calculate("gasyashchiy-kondensator.html", { uc: "220", un: "12", i: "20", f: "50" }, ["Расчётная ёмкость0,2898 мкФ", "Ближайший стандартный номинал0,33 мкФ"]);
await calculate("skin-effekt.html", { f: "100", mat: "0.0175", mu: "1", d: "1" }, ["Глубина скин-слоя δ0,21054 мм", "около 1,504 раз"]);
await calculate("snabber-rc.html", { f0: "20", cadd: "470", v: "400", fsw: "100", k: "4" }, ["Паразитная индуктивность Lпар404,2 нГн", "Резистор снаббера Rs51 Ом", "Мощность на резисторе10,03 Вт"]);
await calculate("umnozhitel-napryazheniya.html", { u: "220", n: "3", c: "1", f: "50", i: "1", vf: "1" }, ["Идеальное выходное (2n·Uм)1866,76 В", "Реальное выходное напряжение1420,76 В"]);
await calculate("attenyuator.html", { a: "6", z: "50", p: "100" }, ["Коэффициент по напряжению K1,99526", "Мощность на выходе25,12 мВт"]);

// Обработка ошибок в новых калькуляторах
await calculate("molniezashchita.html", { h: "12", nad: "0.99", hx: "10" }, ["не защищён"]);
await calculate("vnutrennee-soprotivlenie.html", { mode: "xx", e: "12", u: "12,5", i: "10" }, ["должно быть меньше напряжения холостого хода"]);
await calculate("solnechnye-paneli-massiv.html", { voc: "41,5", vmp: "34,5", beta: "0,30", tmin: "-30", vmax: "250", n: "5" }, ["отрицательный"]);

{
  const dom = await load("zakon-oma.html");
  setValues(dom.window.document, { u: "12abc", r: "6" });
  dom.window.document.getElementById("go").click();
  const result = dom.window.document.getElementById("res").textContent;
  check(result.includes("Заполните ровно два поля"), "Числовой ввод принимает мусор после числа (например, 12abc)");
  dom.window.close();
}

const sitemap = fs.readFileSync(path.join(sourceDir, "sitemap.xml"), "utf8");
const robots = fs.readFileSync(path.join(sourceDir, "robots.txt"), "utf8");
const sitemapPages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
check(sitemapPages.length === 101, `В sitemap должен быть 101 URL, найдено ${sitemapPages.length}`);
check(!sitemap.includes("REPLACE-WITH-YOUR-ADDRESS"), "В sitemap остался адрес-заглушка");
check(robots.includes("Sitemap: https://macos2024.github.io/sitemap.xml"), "В robots.txt не активирован sitemap");
for (const file of htmlFiles) {
  check(sitemapPages.some(url => url.endsWith(`/${file}`) || (file === "index.html" && /\/$/.test(url))), `В sitemap отсутствует ${file}`);
}

console.log(JSON.stringify({ checks, failures: failures.length }, null, 2));
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
}
