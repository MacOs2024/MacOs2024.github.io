# Реестр инженерной проверки расчётов

Статус каждого расчёта на сайте. Правила ведения — в
[`PROJECT_RULES.md`](PROJECT_RULES.md). Формальное подтверждение владельца не
требуется: агент продолжает проверку по первоисточникам, а при нехватке данных
снимает нормативный вердикт или переводит расчёт в оценочный режим.

## Статусы

| Статус | Что означает |
|---|---|
| `verified` | Первоисточник, независимая вторая проверка и полная матрица тестов согласуются |
| `agent-reviewed` | Формула сверена с указанным первоисточником и покрыта эталонами; независимая вторая проверка ещё не завершена |
| `estimate` | Физическая оценка с явно показанными допущениями, без нормативного обещания |
| `pending` | Расчёт отключён либо не выдаёт нормативный вердикт до проверки |

Поле «Проверил» указывает только фактического проверяющего. Имя владельца
проекта нельзя подставлять автоматически.

## Проверенные и ограниченные расчёты на 11.08.2026

| Slug | Статус | Основание | Эталонные сценарии | Проверил |
|---|---|---|---:|---|
| `tok-korotkogo-zamykaniya` | `agent-reviewed` | Schneider Electric EIG: conventional method `0,8·U/Z`, диапазоны B/C/D | 8 + неверный ввод | Codex, источник и тесты |
| `sechenie-pe-provodnika` | `agent-reviewed` | Schneider Electric EIG: правило `S`, `16`, `S/2` и минимумы 2,5/4 мм² | 13 + неверный ввод | Codex, источник и тесты |
| `sechenie-kabelya` | `agent-reviewed` | ПУЭ 1.3.4/1.3.5 только для двух явно названных колонок; `Iz = Iтабл·Kt·Kg` | 2 + неверный ввод | Codex, источник и тесты |
| `padenie-napryazheniya` | `estimate` | Schneider Electric EIG / IEC 60364-5-52: пользовательский бюджет, активное сопротивление при 20 °C | 3 + неверный ввод | Codex, источник и тесты |
| `dlina-kabelya-po-padeniyu` | `estimate` | Обратная задача падения напряжения с теми же ограничениями | 2 + неверный ввод | Codex, источник и тесты |
| `koefficienty-prokladki` | `agent-reviewed` | Schneider Electric EIG: коэффициенты зависят от точного способа прокладки; автоматическая таблица удалена | 2 + неверный ввод | Codex, источник и тесты |
| `vybor-avtomata` | `agent-reviewed` | Schneider Electric EIG: `IB ≤ In ≤ Iz`, `Icn ≥ Isc`; B/C/D не угадывается | 3 + неверный ввод | Codex, источник и тесты |
| `vybor-uzo` | `agent-reviewed` | Schneider Electric EIG / IEC summaries: ≤30 мА, ≤300 мА, типы AC/A/F/B | 2 режима | Codex, источник и тесты |
| `emkostnyy-tok-utechki` | `agent-reviewed` | ПУЭ 7.1.83 как оценка только при отсутствии фактических данных | 2 + неверный ввод | Codex, источник и тесты |
| `raschet-zazemleniya` | `estimate` | Schneider Electric EIG: `R ≈ ρ/(nL)` только при шаге `>4L`; обязательное измерение | 3 + неверный ввод | Codex, источник и тесты |
| `prosadka-pri-puske` | `estimate` | Schneider Electric EIG: пусковой ток и провал; универсальный предел 15% удалён | 2 + неверный ввод | Codex, источник и тесты |
| `molniezashchita` | `agent-reviewed` | СО 153-34.21.122-2003, таблица 3.4 и формула 3.1, диапазон до 150 м | 6 + неверный ввод | Codex, источник и тесты |
| `raschet-radiatora` | `agent-reviewed` | onsemi AND9016/D и AND9859/D: последовательная тепловая цепь `Rθjc + Rθcs + Rθsa` | 3 + неверный ввод | Codex, источник и тесты |
| `gasyashchiy-kondensator` | `pending` | Опасный расчёт снят с публикации | не применимо | — |

## Проход по 64 расчётам с одним эталоном

Все 64 расчёта получили карточку с документом, организацией, редакцией,
разделами, датой обращения и границами применимости. Для каждого добавлен как
минимум второй независимо рассчитанный числовой эталон; для переключаемых
интерфейсов закрыты все режимы. Статус `verified` не присваивался: внешней
независимой инженерной проверки не было.

### `agent-reviewed` — 32

`attenyuator`, `bazovyy-rezistor-tranzistora`, `delitel-napryazheniya`,
`delitel-toka`, `discharge-resistor-capacitor`,
`dobavochnyy-rezistor-voltmetra`, `energiya-kondensatora`, `impedans-rlc`,
`koefficient-transformacii`, `lc-filtr-raschet`, `linear-regulator-loss`,
`markirovka-rezistorov`, `moshchnost-po-schetchiku`, `moshchnost-toka`,
`most-uitstona`, `nagrevanie-dzhoulya-lentsa`, `ne555-astabilnyy`, `rc-filtr`,
`reaktivnoe-soprotivlenie`, `rezistor-svetodioda`, `rezonans-lc`,
`rms-amplituda`, `shunt-ampermetra`, `soedinenie-rezistorov`,
`soprotivlenie-provoda`, `stoimost-elektroenergii`, `stoimost-osveshcheniya`,
`temperaturnyy-koefficient`, `tok-po-moshchnosti`, `zakon-oma`,
`zapolnenie-truby-kabelem`, `zaryad-kondensatora`.

### `estimate` — 32

`batareya-posledovatelno-parallelno`, `battery-charge-time`,
`diametr-provoda-obmotki`, `diode-bridge-loss`, `dlina-antenny`,
`drossel-impulsnogo`, `generator-sizing`, `kondensator-dvigatelya`,
`kpd-transformatora`, `kva-kvt`, `liion-charge-current`,
`moshchnost-elektrokotla`, `moshchnost-nasosa`, `nagruzka-kvartiry`,
`power-bank-runtime`, `pulsacii-vypryamitelya`, `raschet-akb-avtonomnoy`,
`raschet-invertora`, `raschet-osveshcheniya`, `raschet-transformatora`,
`sechenie-po-dline-12v`, `shim-srednee-napryazhenie`, `skin-effekt`,
`snabber-rc`, `solar-panel-energy`, `stabilitron-rezistor`, `teplyy-pol`,
`tok-elektrodvigatelya`, `umnozhitel-napryazheniya`,
`voltage-stabilizer-size`, `vremya-raboty-akkumulyatora`,
`zaryadka-elektromobilya`.

Основные основания: OpenStax для базовых цепей и тождеств; NIST для свойств
меди; Texas Instruments для 555, LDO, импульсных преобразователей и снаббера;
onsemi для условия `VCE(sat)`; Vishay/IEC 60062 для маркировки; Victron и TI
для аккумуляторных оценок; Schneider Electric и DOE для мощности и двигателей;
NREL для PV; ARRL для антенн и аттенюаторов; NFPA 70 Chapter 9 Table 1 для
геометрического заполнения труб; СП 52.13330.2016 для освещения; SEW-EURODRIVE
и JS-Technik для схемы Штейнмеца; Danfoss для ограничений тёплого пола.

## Исправленные риски этого прохода

- Базовый резистор BJT теперь считается по принудительному `β = Ic/Ib` из
  условия `VCE(sat)` даташита, а не по обычному `hFE` с произвольным множителем.
- Пассивный LC ФНЧ приведён к Баттерворту: `L = √2·R/ω`,
  `C = 1/(√2·R·ω)`, `Q = 1/√2`. Прежний вариант имел `Q = 1` и не давал
  заявленную точку −3 дБ.
- Для схемы Штейнмеца удалены универсальные коэффициенты 4800/2800 и
  автоматический «пусковой конденсатор». Теперь это только предварительная
  рабочая ёмкость для двигателя, допускающего `Δ` при напряжении сети.
- Нагрузка квартиры, электрокотёл и тёплый пол больше не выбирают автомат по
  одному расчётному току: выводят «недостаточно данных».
- Инвертор принимает пользовательский бюджет падения и показывает фактические
  падение и потери для следующего стандартного сечения.
- Проценты заполнения 53/31/40 прямо названы правилом NEC/NFPA 70, а не ПУЭ;
  результат не выдаётся за подтверждение допустимого тока или российского
  нормативного соответствия.
- E24 в аттенюаторе явно обозначен как округление, после которого согласование
  и ослабление нужно пересчитать или измерить.

## Проход по оставшимся 22 расчётам

Все 99 работающих калькуляторов теперь имеют карточки с источниками, редакцией,
разделами и явными границами применимости. Статус `verified` не присваивался:
выполнены независимые контрольные подстановки и сравнение с дополнительными
документами, но внешнего инженера-проверяющего не было.

### `agent-reviewed` — 11

`awg-mm2`, `decibel`, `lm317-resistor`, `ne555-monostabilnyy`, `ou-usilenie`,
`power-energy-units`, `preobrazovanie-y-delta`, `soedinenie-katushek`,
`soedinenie-kondensatorov`, `ten-moshchnost-tok`, `zvezda-treugolnik`.

### `estimate` — 11

`buck-boost-duty`, `induktivnost-katushki`, `ntc-termistor`, `perevod-ah-wh`,
`power-factor-compensation`, `shirina-dorozhki-pcb`,
`solnechnye-paneli-massiv`, `tok-v-nule-perekos`, `toroid-turns-al`,
`vnutrennee-soprotivlenie`, `vremya-nagreva-vody`.

Основные новые основания: BIPM и NIST для децибелов и единиц; NIST Handbook
100 для AWG; TI для LM317, LM555, ОУ и импульсных топологий; Vishay для NTC;
исходная статья Wheeler и каталог Magnetics для катушек; Schneider Electric
для компенсации реактивной мощности и нейтрали при гармониках; Victron,
Canadian Solar и NREL для PV; OpenStax и MIT OCW для линейной модели источника;
NIST WebBook для температурной зависимости теплоёмкости воды.

## Дополнительные исправления риска

- Калькулятор ОУ больше не смешивает однополярное и двуполярное питание:
  пользователь вводит нижнюю и верхнюю допустимые границы выхода из даташита.
- Для DC/DC удалён универсальный диапазон `D = 0,1…0,85` и обещание
  автоматической компенсации; пределы теперь прямо отнесены к контроллеру.
- `20·lg` для напряжения и тока ограничено случаем квадратной связи с мощностью;
  при разных импедансах требуется отношение мощностей.
- Ток нейтрали явно считается только для основной гармоники; тройные гармоники
  и выбор сечения исключены из вердикта.
- Проверка PV выдаёт сравнение введённых значений, а не утверждение
  «проходит»: допуски, температура ячейки и запас остаются проектными данными.
- `I` при `U=0` и `Pmax` источника названы экстраполяциями модели Тевенина;
  удалены типовые сопротивления и диагностические обещания для батарей.
- Из расчёта дорожки PCB удалён произвольный запас 25%; результат назван
  исторической аппроксимацией графиков IPC-2221, а не нормативным минимумом.
- Для NTC, А·ч↔Вт·ч, нагрева воды, ТЭНа и последовательных конденсаторов
  уточнены температурные, паспортные и модельные ограничения.

## Независимая перепроверка наиболее рискованных расчётов

Вторая документальная сверка выполнена без повышения статуса до `verified`:
это дополнительный производительский источник и контрольные подстановки,
а не подпись независимого инженера.

- ABB *Electrical Installation Handbook*, vol. 2, разделы 2.5 и 5.8,
  независимо подтверждает табличное правило PE, минимумы 2,5/4 мм² для
  отдельного медного PE и коэффициент `0,8` в конвенциональной проверке петли.
  Результаты `sechenie-pe-provodnika` и `tok-korotkogo-zamykaniya` совпали;
  статус оставлен `agent-reviewed`.
  <https://library.e.abb.com/public/a5861200ea7c59fec1256dc50039e0ed/1SDC010001D0201.pdf>
- Тот же справочник ABB, раздел 5.7, подтверждает различие RCCB/RCBO, принцип
  остаточного тока и формы токов для типа B. Он также показывает, что токи
  утечки и селективность требуют отдельной координации; универсальный подбор
  УЗО по двум полям не добавлялся.
- DEHN указывает методы защитного угла и катящейся сферы с привязкой к классу
  LPS. Это подтверждает, что `molniezashchita` нельзя обобщать за пределы
  указанной российской методики СО 153-34.21.122-2003; статус не повышен.
  <https://www.dehn-international.com/sites/default/files/media/files/dehnsupport-toolbox-ds709-e.pdf>
- Для `raschet-zazemleniya` второй источник не устраняет зависимость от грунта,
  геометрии и измерения. Оценочный статус и требование фактического измерения
  сохранены.
- Для PV, нейтрали и PCB независимая сверка соответственно с Victron,
  Schneider Electric и Qorvo привела к снятию категоричных вердиктов, а не к
  повышению статуса.

## Оставшийся инженерный долг

Калькуляторов без карточки источника больше нет. `gasyashchiy-kondensator`
остаётся `pending` и отключён из-за опасности безтрансформаторной сетевой схемы.
Статус `verified` потребует фактической внешней инженерной проверки; имя
проверяющего до этого не указывается.

## Локальная приёмка 11.08.2026

- `npm test` — 8110 проверок: 5634 structural, 2076 functional, 400 boundary;
  failures: 0; калькуляторов только с одним сценарием: 0.
- `python3 -W error generator/build.py` — 100 страниц и служебные файлы.
- Две последовательные полные сборки дали одинаковый хеш diff сгенерированных
  HTML/sitemap/robots:
  `6fd0e01149dae323486fa079bf4fd9eedf8aa755c2d391eb456e7c3d1bb057de`.
- `npm ci` — успешно; `npm audit` — 0 уязвимостей; `git diff --check` — без
  замечаний.
- Финальный живой Playwright-прогон: 34/34 за 10,2 с (17 desktop + 17 mobile),
  включая весь каталог без JS-ошибок и горизонтального скролла.
