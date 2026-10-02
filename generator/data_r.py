# -*- coding: utf-8 -*-
"""Партия №5, раздел «Силовая электроника»: потери и КПД понижающего (buck)
преобразователя, RCD-снаббер обратноходового преобразователя, нагрев
MOSFET с учётом роста Rds(on), резистор затвора и драйвер MOSFET и IGBT.

Категория — «Электроника» (elektronika): там уже стоят buck-boost-duty,
drossel-impulsnogo, snabber-rc, raschet-radiatora, linear-regulator-loss и
diode-bridge-loss. Отдельного раздела для силовой электроники в каталоге нет,
и новый здесь не вводится.

Источники вписаны прямо в записи (поле sources). WebFetch в окружении агента
недоступен, прямая загрузка страниц через curl заблокирована, поэтому
источнику приписано только то, что видно в поисковой выдаче; над каждой
записью сказано, что видно и как это отражено на странице. Паспортные
величины (Rds(on), Qg, Qgd, Crss, Coss, Vth, Rθ, Tj max, индуктивность
рассеяния) вводит пользователь; калькулятор их не подставляет. Значения
полей по умолчанию — условные, для примера; это сказано в тексте примеров.
Эталонные значения тестов посчитаны отдельным скриптом (scratchpad r/ref.py)
другими способами — численным интегрированием формы тока, итерацией и
делением отрезка пополам, — а не кодом страниц.
"""

ACCESSED = "01.10.2026"

# Общие JS-хелперы. fx: число рядом с порогом показывается с таким числом
# значащих цифр, чтобы округлённое значение лежало по ту же сторону порога,
# что и точное (правило партий №2–4). OPT: необязательное поле — пустое даёт
# null, нечисловое — NaN (строгий ввод сохраняется).
R_JS = r'''
function gt(a,b){return a>b+Math.abs(b)*1e-12;}
function ge(a,b){return a>=b-Math.abs(b)*1e-12;}
function lt(a,b){return a<b-Math.abs(b)*1e-12;}
function fx(x,lim){if(Math.abs(x-lim)<=Math.abs(lim)*1e-12)return fmt(x,4);for(var p=4;p<=12;p++){var r=Number(x.toPrecision(p));if(x<lim?lt(r,lim):gt(r,lim))return fmt(x,p);}return fmt(x,12);}
function OPT(id){var el=$(id);if(!el)return null;if(String(el.value).trim()==='')return null;return P(id);}
function sx(x,lim,u){var Pr=[[1e9,'Г'],[1e6,'М'],[1e3,'к'],[1,''],[1e-3,'м'],[1e-6,'мк'],[1e-9,'н'],[1e-12,'п']];for(var i=0;i<Pr.length-1;i++){if(Math.abs(x)>=Pr[i][0])break;}return fx(x/Pr[i][0],lim/Pr[i][0])+' '+Pr[i][1]+u;}
'''

# ─── Общие источники ─────────────────────────────────────────────────────────
ROHM_BUCK = dict(
    title="Efficiency of Buck Converter. Application Note",
    organization="ROHM Semiconductor",
    edition="No. 64AN035E Rev.004, ноябрь 2022; формулы видны в выдаче",
    accessed=ACCESSED,
    url="https://fscdn.rohm.com/en/products/databook/applinote/ic/power/switching_regulator/buck_converter_efficiency_app-e.pdf",
)
ROHM_TECHWEB = dict(
    title="Losses in Synchronous Rectifying Step-Down Converters (серия статей TechWeb)",
    organization="ROHM Semiconductor, TechWeb",
    edition="онлайн-статьи на дату обращения: потери мёртвого времени, заряда затвора, собственного потребления контроллера; видны в выдаче",
    accessed=ACCESSED,
    url="https://techweb.rohm.com/product/power-ic/dcdc/6486/",
)
TI_SLVA390 = dict(
    title="Calculating Efficiency (SLVA390A)",
    organization="Texas Instruments, Arvind Raj",
    edition="февраль 2010, редакция A — март 2020; видно в выдаче",
    accessed=ACCESSED,
    url="https://www.ti.com/lit/pdf/slva390",
)
TI_SLVA477 = dict(
    title="Basic Calculation of a Buck Converter's Power Stage (SLVA477B)",
    organization="Texas Instruments, Brigitte Hauke",
    edition="редакция B — август 2015; формула размаха тока видна в выдаче",
    accessed=ACCESSED,
    url="https://www.ti.com/lit/pdf/slva477",
)
TI_SLVAEQ9 = dict(
    title="An Accurate Approach for Calculating the Efficiency of a Synchronous Buck Converter Using the MOSFET Plateau Voltage (SLVAEQ9)",
    organization="Texas Instruments",
    edition="июль 2020; положения видны в пересказе выдачи",
    accessed=ACCESSED,
    url="https://www.ti.com/lit/pdf/slvaeq9",
)
INFINEON_LOSSES = dict(
    title="MOSFET Power Losses Calculation Using the Data-Sheet Parameters",
    organization="Infineon Technologies, D. Graovac, M. Pürschel, A. Kiep",
    edition="Application Note V1.1, июль 2006; формулы видны в выдаче",
    accessed=ACCESSED,
    url="https://www.infineon.com/gated/infineon-70-41484-applicationnotes-en_f72138ac-8173-4b5c-8c8e-63dd1e039074",
)
MCHP_AN1471 = dict(
    title="AN1471. Efficiency Analysis of a Synchronous Buck Converter using Microsoft Office Excel-Based Loss Calculator",
    organization="Microchip Technology, Joseph Depew",
    edition="DS01471A, 2012; положения видны в выдаче, уравнение Coss — нет",
    accessed=ACCESSED,
    url="https://ww1.microchip.com/downloads/en/Appnotes/01471A.pdf",
)
TI_SLPA009 = dict(
    title="Power Loss Calculation With Common Source Inductance Consideration for Synchronous Buck Converters (SLPA009A)",
    organization="Texas Instruments",
    edition="июнь 2011, редакция A — июль 2011; видно в выдаче",
    accessed=ACCESSED,
    url="https://www.ti.com/lit/slpa009",
)
TI_SLUA618 = dict(
    title="Fundamentals of MOSFET and IGBT Gate Driver Circuits (SLUA618A)",
    organization="Texas Instruments, Laszlo Balogh",
    edition="март 2017, редакция A — октябрь 2018; положения видны в выдаче",
    accessed=ACCESSED,
    url="https://www.ti.com/lit/pdf/slua618",
)
FCS_AN4147 = dict(
    title="AN-4147. Design Guidelines for RCD Snubber of Flyback Converters",
    organization="Fairchild Semiconductor (ныне onsemi)",
    edition="Rev. 1.1.0 по выдаче, исходная редакция 2006; положения видны в выдаче, формулы — в её пересказе на EDN",
    accessed=ACCESSED,
    url="https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/196/Design-Guidelines-for-RCD-Snubber-of-Flyback-Converters_2D00_Fairchild-AN4147.pdf",
)
EDN_RCD = dict(
    title="Designing the RCD Snubber of Flyback Converter",
    organization="EDN (публикация методики Fairchild AN-4147, вторичный источник)",
    edition="онлайн-статья на дату обращения; формулы видны в выдаче",
    accessed=ACCESSED,
    url="https://www.edn.com/designing-the-rcd-snubber-of-flyback-converter/",
)
TI_KOLLMAN = dict(
    title="Power Tips #17: Snubbing the flyback converter (SSZTCV6)",
    organization="Texas Instruments, Robert Kollman",
    edition="техническая статья на дату обращения; положения видны в выдаче",
    accessed=ACCESSED,
    url="https://www.ti.com/lit/pdf/ssztcv6",
)
ADI_DS32 = dict(
    title="Correct Snubber Power Loss Estimate Saves the Day (Design Note DS32)",
    organization="Analog Devices",
    edition="design note на дату обращения; формула сопротивления видна в пересказе выдачи",
    accessed=ACCESSED,
    url="https://www.analog.com/media/en/reference-design-documentation/design-notes/ds32-correct-snubber-power-loss-estimate-saves-the-day.pdf",
)
TI_SLUP338 = dict(
    title="Flyback transformer design considerations for efficiency and EMI (SLUP338)",
    organization="Texas Instruments, Bernard Keogh, Power Supply Design Seminar",
    edition="редакция на дату обращения; способ измерения виден в выдаче",
    accessed=ACCESSED,
    url="https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/196/slup338.pdf",
)
INFINEON_ALPHA = dict(
    title="Introduction to the MOSFET temperature coefficient α",
    organization="Infineon Developer Community, Knowledge Base Article",
    edition="онлайн-статья на дату обращения; формула видна в выдаче",
    accessed=ACCESSED,
    url="https://community.infineon.com/t5/Knowledge-Base-Articles/Introduction-to-the-MOSFET-temperature-coefficient-%CE%B1/ta-p/939093",
)
ONSEMI_AND9016 = dict(
    title="Heat Sink Selection Guide for Thermally Enhanced SO8-FL",
    organization="onsemi",
    edition="AND9016/D, Rev. 1, February 2015",
    accessed=ACCESSED,
    url="https://www.onsemi.com/download/application-notes/pdf/and9016-d.pdf",
)
MCHP_APT0403 = dict(
    title="Power MOSFET Tutorial (APT-0403)",
    organization="Microsemi (ныне Microchip)",
    edition="Rev B, 2 марта 2006; положения видны в выдаче",
    accessed=ACCESSED,
    url="https://ww1.microchip.com/downloads/aemDocuments/documents/PSDS/ApplicationNotes/ApplicationNotes/APT0403.pdf",
)
NEXPERIA_AN90059 = dict(
    title="AN90059. Power MOSFET gate driver fundamentals",
    organization="Nexperia",
    edition="Rev. 1 — 22 апреля 2025; формулы и пример видны в выдаче",
    accessed=ACCESSED,
    url="https://assets.nexperia.com/documents/application-note/AN90059.pdf",
)
NEXPERIA_AN11158 = dict(
    title="AN11158. Understanding power MOSFET data sheet parameters",
    organization="Nexperia",
    edition="Rev. 7.0 — 18 февраля 2025; положение видно в выдаче",
    accessed=ACCESSED,
    url="https://assets.nexperia.com/documents/application-note/AN11158.pdf",
)
INFINEON_RG = dict(
    title="Calculation of Gate Resistance in Driver Circuit",
    organization="Infineon Developer Community, Knowledge Base Article",
    edition="онлайн-статья на дату обращения; пример виден в выдаче",
    accessed=ACCESSED,
    url="https://community.infineon.com/t5/Knowledge-Base-Articles/Calculation-of-Gate-Resistance-in-Driver-Circuit/ta-p/960842",
)
INFINEON_DVDT = dict(
    title="Effect of dv/dt on gate voltage of the power MOSFET",
    organization="Infineon Developer Community, Knowledge Base Article",
    edition="онлайн-статья на дату обращения; формула видна в выдаче",
    accessed=ACCESSED,
    url="https://community.infineon.com/t5/Knowledge-Base-Articles/Effect-of-dv-dt-on-gate-voltage-of-the-power-MOSFET/ta-p/761094",
)
IR_WU = dict(
    title="Cdv/dt Induced Turn-On in Synchronous Buck Regulators",
    organization="International Rectifier (ныне Infineon), Thomas Wu",
    edition="статья на дату обращения; механизм виден в выдаче, замкнутая формула — в её пересказе",
    accessed=ACCESSED,
    url="https://www.infineon.com/assets/row/public/documents/24/54/syncbuckturnon.pdf",
)
TI_UCC21520 = dict(
    title="UCC21520, UCC21520A Isolated Dual-Channel Gate Drivers — Gate to Source Resistor Selection; [FAQ] UCC21520: Parallel resistor between Gate and Source",
    organization="Texas Instruments: паспорт и FAQ форума E2E",
    edition="редакции на дату обращения; назначение резистора видно в выдаче, числового значения в паспорте не найдено",
    accessed=ACCESSED,
    url="https://www.ti.com/lit/ds/symlink/ucc21520.pdf",
)
INFINEON_1EDN = dict(
    title="EiceDRIVER 1EDN751x / 1EDN851x. Data Sheet",
    organization="Infineon Technologies",
    edition="v02_03; выходные сопротивления видны в выдаче",
    accessed=ACCESSED,
    url="https://www.infineon.com/dgdl/Infineon-1EDN751x_1EDN851x-DataSheet-v02_03-EN.pdf?fileId=5546d462576f34750157e176df0b3ca7",
)


CALCS_R = [

# ─── 1. Потери и КПД понижающего (buck) преобразователя ─────────────────────
# Видно в выдаче: TI SLVA390A (A. Raj) — три главные причины потерь:
# проводимость дросселя, проводимость ключей, переключение. ROHM 64AN035E
# Rev.004 — P_SW-H = ½·VIN·IOUT·(tr + tf)·fSW; P_COSS = ½·COSS-H·VIN²·fSW,
# COSS-H = CDS-H + CGD-H; P_ON-D = IOUT·VF·(1 − VOUT/VIN); потери заряда
# затвора — Qg (верхнего и нижнего)·VGS·fSW; мёртвое время — VD·IO·(tDr + tDf)·fSW
# (и в статьях TechWeb); собственное потребление контроллера — VIN·ICC.
# Infineon (Graovac и др., V1.1, 2006): EonM = UDD·IDon·(tri + tfu)/2 +
# Qrr·UDD, EoffM = UDD·IDoff·(tru + tfi)/2 — токи в моменты включения и
# выключения. TI SLVAEQ9: пять интервалов переключения, t = QGS2/IG и QGD/IG;
# нижний ключ переключается при нулевом напряжении. Microchip AN1471: Coss
# обоих ключей заряжается каждый период (само уравнение в выдаче не видно).
# TI SLVA477B: ΔIL = (VIN − VOUT)·D/(fS·L). D с учётом падений — из равенства
# вольт-секунд на дросселе; вывод на странице. Статус estimate: переключение —
# линейная аппроксимация фронтов, Coss нелинейна, часть эффектов не учтена.
dict(
slug="poteri-buck-preobrazovatelya", cat="elektronika",
name="Потери и КПД понижающего преобразователя (buck)",
h2_topic="Потери buck-преобразователя",
short="Потери по статьям: проводимость и переключение ключей, Coss, мёртвое время, затворы, дроссель; КПД",
title="Потери и КПД понижающего buck-преобразователя: синхронная схема и схема с диодом",
desc="Расчёт потерь и КПД понижающего (buck) преобразователя по паспортным данным ключей: коэффициент заполнения с учётом падений, действующие токи, проводимость и переключение MOSFET, заряд Coss, мёртвое время, обратное восстановление, заряд затворов, DCR и сердечник дросселя, ток контроллера — и какая статья главная.",
intro='Калькулятор раскладывает потери понижающего преобразователя по статьям — ключи, переключение, ёмкости, мёртвое время, затворы, дроссель — и показывает КПД и главную статью. Идеальное отношение напряжений даёт <a href="buck-boost-duty.html">калькулятор коэффициента заполнения</a>, индуктивность по пульсациям — <a href="drossel-impulsnogo.html">калькулятор дросселя импульсного преобразователя</a>.',
kw="потери buck преобразователя кпд понижающего преобразователя синхронный buck потери mosfet переключение проводимость coss мёртвое время dead time qg qgd qgs2 dcr дросселя расчёт кпд dc-dc",
fields=[
 dict(type="select", id="top", label="Схема", opts=[
  ("sync","Синхронная: верхний и нижний MOSFET"),
  ("diode","С диодом: верхний MOSFET и диод")], val="sync"),
 dict(id="vin", label="Входное напряжение Vin", unit="В", val="12"),
 dict(id="vout", label="Выходное напряжение Vout", unit="В", val="3,3"),
 dict(id="iout", label="Ток нагрузки Iout", unit="А", val="5"),
 dict(id="fsw", label="Частота переключения fsw", unit="кГц", val="500"),
 dict(type="select", id="rip", label="Пульсации тока дросселя", opts=[
  ("l","Рассчитать по индуктивности L"),
  ("di","Задать размах тока ΔI")], val="l"),
 dict(id="l", label="Индуктивность дросселя L", unit="мкГн", val="3,3", hint="Индуктивность при рабочем токе по паспорту дросселя"),
 dict(id="di", label="Размах тока дросселя ΔI, от впадины до пика", unit="А", val="1,5", hint="Измеренный или из расчёта дросселя"),
 dict(id="rh", label="Rds(on) верхнего ключа при рабочей температуре", unit="мОм", val="8", hint="При вашем напряжении затвора и ожидаемой температуре кристалла: максимум при 25 °C из паспорта, умноженный на нормированный множитель с графика Rds(on) от Tj. Калькулятор не умножает его на температурный множитель повторно"),
 dict(id="rl", label="Rds(on) нижнего ключа при рабочей температуре", unit="мОм", val="4", hint="Так же, как для верхнего ключа"),
 dict(id="vfd", label="Прямое напряжение диода Vf при токе нагрузки", unit="В", val="0,45", hint="По прямой характеристике из паспорта диода при вашем токе и температуре"),
 dict(id="vdrv", label="Напряжение драйвера — амплитуда на затворе", unit="В", val="5"),
 dict(id="qgh", label="Полный заряд затвора Qg верхнего ключа", unit="нКл", val="10", hint="По паспорту при вашем напряжении драйвера"),
 dict(id="qgl", label="Полный заряд затвора Qg нижнего ключа", unit="нКл", val="20"),
 dict(type="select", id="sw", label="Время переключения верхнего ключа", opts=[
  ("q","Рассчитать по зарядам затвора и цепи драйвера"),
  ("t","Задать времена фронтов")], val="q"),
 dict(id="qgs2", label="Заряд Qgs2 — от порога до плато", unit="нКл", val="2", hint="В паспортах Infineon (IR) его дают отдельно или в составе Qsw = Qgs2 + Qgd. Если дан только Qgs, Qgs2 — его часть после порогового напряжения по графику заряда затвора"),
 dict(id="qgd", label="Заряд Qgd — плато Миллера", unit="нКл", val="3", hint="По паспорту; с ростом напряжения сток–исток Qgd растёт (Nexperia) — берите значение при напряжении, близком к Vin"),
 dict(id="vpl", label="Напряжение плато Миллера", unit="В", val="3", hint="По графику заряда затвора из паспорта при токе, близком к току нагрузки"),
 dict(id="rgon", label="Сопротивление цепи затвора при включении", unit="Ом", val="3", hint="Сумма: выходное сопротивление драйвера на подтяжку к питанию, внешний резистор затвора и внутренний Rg ключа. Подробно — на странице резистора затвора"),
 dict(id="rgoff", label="Сопротивление цепи затвора при выключении", unit="Ом", val="2", hint="Сумма: сопротивление драйвера на сток к нулю, внешний резистор и внутренний Rg ключа"),
 dict(id="tr", label="Полное время включения — рост тока и спад напряжения", unit="нс", val="10", hint="Если измерен только спад напряжения на узле переключения, прибавьте время нарастания тока — иначе потери занижены. Паспортные tr и tf сняты в условиях испытаний производителя и к вашей схеме относятся приблизительно"),
 dict(id="tf", label="Полное время выключения — рост напряжения и спад тока", unit="нс", val="8"),
 dict(id="vsd", label="Прямое напряжение внутреннего диода нижнего ключа Vsd", unit="В", val="0,8", hint="По паспорту при токе, близком к току нагрузки"),
 dict(id="tdt", label="Мёртвое время на каждом фронте", unit="нс", val="20", hint="По паспорту контроллера или драйвера; при адаптивном мёртвом времени — по измерению"),
 dict(id="cossh", label="Выходная ёмкость Coss верхнего ключа", unit="пФ", val="300", hint="По паспорту. Coss зависит от напряжения сток–исток, а паспортное значение дано при одном напряжении"),
 dict(id="cossl", label="Ёмкость нижнего ключа Coss или диода Cj", unit="пФ", val="600", hint="Необязательное. Пустое поле — учитывается только Coss верхнего ключа, как в формуле ROHM"),
 dict(id="qrr", label="Заряд обратного восстановления Qrr", unit="нКл", val="", hint="Необязательное: внутреннего диода нижнего ключа или кремниевого диода — по паспорту при близких токе и скорости спада тока. У диода Шоттки обратного восстановления практически нет"),
 dict(id="dcr", label="Сопротивление обмотки дросселя DCR", unit="мОм", val="10", hint="Необязательное: по паспорту дросселя с учётом нагрева обмотки"),
 dict(id="pcore", label="Потери в сердечнике дросселя", unit="Вт", val="", hint="Необязательное: по данным или онлайн-инструменту производителя дросселя для ваших частоты и размаха тока"),
 dict(id="iq", label="Ток потребления контроллера Iq", unit="мА", val="2", hint="Необязательное: по паспорту контроллера при вашей частоте"),
],
js=R_JS + r'''
function sync(){var s=S('top')==='sync',l=S('rip')==='l',q=S('sw')==='q';
hideF('rl',!s);hideF('qgl',!s);hideF('vsd',!s);hideF('tdt',!s);hideF('vfd',s);
hideF('l',!l);hideF('di',l);
hideF('qgs2',!q);hideF('qgd',!q);hideF('vpl',!q);hideF('rgon',!q);hideF('rgoff',!q);hideF('tr',q);hideF('tf',q);}
function init(){$('top').addEventListener('change',sync);$('rip').addEventListener('change',sync);$('sw').addEventListener('change',sync);sync();}
function calc(){
var s=S('top')==='sync',lm=S('rip')==='l',q=S('sw')==='q';
var vin=P('vin'),vo=P('vout'),io=P('iout'),f=P('fsw'),rh=P('rh'),vd=P('vdrv'),qh=P('qgh'),ch=P('cossh');
if([vin,vo,io,f,rh,vd,qh,ch].some(isNaN))return err('Заполните числами: Vin, Vout, ток нагрузки, частоту, Rds(on) верхнего ключа, напряжение драйвера, Qg и Coss верхнего ключа.');
if(vin<=0||vo<=0||io<=0||f<=0)return err('Напряжения, ток нагрузки и частота должны быть больше нуля.');
if(!(vo<vin))return err('У понижающего преобразователя Vout меньше Vin. Отношение напряжений других схем — на странице коэффициента заполнения.');
if(rh<=0||vd<=0||qh<=0||ch<=0)return err('Rds(on) верхнего ключа, напряжение драйвера, Qg и Coss должны быть больше нуля.');
f*=1e3;rh/=1e3;qh*=1e-9;ch*=1e-12;
var rl=0,ql=0,vsd=0,tdt=0,vf=0;
if(s){rl=P('rl');ql=P('qgl');vsd=P('vsd');tdt=P('tdt');
 if([rl,ql,vsd,tdt].some(isNaN))return err('Для синхронной схемы заполните числами Rds(on) и Qg нижнего ключа, прямое напряжение его внутреннего диода и мёртвое время.');
 if(rl<=0||ql<=0||vsd<=0||tdt<=0)return err('Rds(on) и Qg нижнего ключа, напряжение внутреннего диода и мёртвое время должны быть больше нуля.');
 rl/=1e3;ql*=1e-9;tdt*=1e-9;}
else{vf=P('vfd');if(isNaN(vf))return err('Введите прямое напряжение диода.');if(vf<=0)return err('Прямое напряжение диода должно быть больше нуля.');}
var cl=OPT('cossl'),qrr=OPT('qrr'),dcr=OPT('dcr'),pco=OPT('pcore'),iq=OPT('iq');
if(cl!==null){if(isNaN(cl))return err('Ёмкость нижнего ключа или диода — число в пикофарадах. Если её нет, оставьте поле пустым.');if(cl<=0)return err('Ёмкость нижнего ключа или диода должна быть больше нуля.');cl*=1e-12;}
if(qrr!==null){if(isNaN(qrr))return err('Qrr — число в нанокулонах. Если его нет, оставьте поле пустым.');if(qrr<=0)return err('Qrr должен быть больше нуля.');qrr*=1e-9;}
if(dcr!==null){if(isNaN(dcr))return err('DCR — число в миллиомах. Если его нет, оставьте поле пустым.');if(dcr<=0)return err('DCR должно быть больше нуля.');dcr/=1e3;}
if(pco!==null){if(isNaN(pco))return err('Потери в сердечнике — число в ваттах. Если их нет, оставьте поле пустым.');if(pco<0)return err('Потери в сердечнике не могут быть отрицательными.');}
if(iq!==null){if(isNaN(iq))return err('Ток контроллера — число в миллиамперах. Если его нет, оставьте поле пустым.');if(iq<0)return err('Ток контроллера не может быть отрицательным.');iq*=1e-3;}
var rd=dcr===null?0:dcr;
if(!(vo+io*(rh+rd)<vin))return err('Падение на верхнем ключе и DCR не оставляет запаса: Vout + Iout·(Rds(on) + DCR) не меньше Vin — такое Vout при этом токе не получить.');
var d=s?(vo+io*(rl+rd))/(vin-io*rh+io*rl):(vo+vf+io*rd)/(vin-io*rh+vf),di;
if(lm){var l=P('l');if(isNaN(l))return err('Введите индуктивность дросселя.');if(l<=0)return err('Индуктивность должна быть больше нуля.');di=(vin-vo)*d/(f*l*1e-6);}
else{di=P('di');if(isNaN(di))return err('Введите размах тока дросселя.');if(di<0)return err('Размах тока не может быть отрицательным.');}
var iv=io-di/2,ip=io+di/2;
if(!(iv>0))return err('Размах тока ΔI = '+fmt(di)+' А не меньше 2·Iout: ток дросселя спадает до нуля, и преобразователь уходит в разрывный режим. Формулы страницы — для непрерывного тока; индуктивность для него подбирает калькулятор дросселя.');
var ton,toff,ign=NaN,igf=NaN;
if(q){var qs=P('qgs2'),qd=P('qgd'),vp=P('vpl'),ra=P('rgon'),rb=P('rgoff');
 if([qs,qd,vp,ra,rb].some(isNaN))return err('Заполните числами Qgs2, Qgd, напряжение плато и сопротивления цепи затвора.');
 if(qs<0)return err('Qgs2 не может быть отрицательным.');
 if(qd<=0||ra<=0||rb<=0)return err('Qgd и сопротивления цепи затвора должны быть больше нуля.');
 if(!(vp>0&&vp<vd))return err('Напряжение плато — больше 0 и меньше напряжения драйвера, иначе ключ не откроется.');
 if(gt((qs+qd)*1e-9,qh))return err('Qgs2 + Qgd больше полного заряда затвора Qg — проверьте данные паспорта.');
 ign=(vd-vp)/ra;igf=vp/rb;ton=(qs+qd)*1e-9/ign;toff=(qs+qd)*1e-9/igf;}
else{ton=P('tr');toff=P('tf');if(isNaN(ton)||isNaN(toff))return err('Введите времена фронтов включения и выключения.');if(ton<=0||toff<=0)return err('Времена фронтов должны быть больше нуля.');ton*=1e-9;toff*=1e-9;}
var T=1/f;
if(!(ton+toff<d*T))return err('Фронты включения и выключения вместе ('+si(ton+toff,'с')+') не короче открытого состояния D·T = '+si(d*T,'с')+': ключ не успевает открыться полностью, модель неприменима.');
if(s&&!(2*tdt<(1-d)*T))return err('Два мёртвых времени ('+si(2*tdt,'с')+') не короче закрытого состояния верхнего ключа (1 − D)·T = '+si((1-d)*T,'с')+'.');
var i2=io*io+di*di/12,ilr=Math.sqrt(i2),a=[],miss=[];
var p1=d*i2*rh,psw=0.5*vin*f*(iv*ton+ip*toff),pco2=0.5*(ch+(cl===null?0:cl))*vin*vin*f,prr=qrr===null?0:qrr*vin*f;
a.push(['проводимость верхнего ключа',p1],['переключение верхнего ключа',psw],['заряд ёмкостей Coss',pco2]);
if(qrr!==null)a.push(['обратное восстановление',prr]);
var p2,pdt=0;
if(s){p2=(1-d)*i2*rl;pdt=2*vsd*io*tdt*f;a.push(['проводимость нижнего ключа',p2],['мёртвое время',pdt]);}
else{p2=vf*io*(1-d);a.push(['прямое падение диода',p2]);}
a.push(['заряд затворов',(qh+ql)*vd*f]);
if(dcr!==null)a.push(['DCR дросселя',i2*dcr]);
if(pco!==null)a.push(['сердечник дросселя',pco]);
if(iq!==null)a.push(['собственное потребление контроллера',vin*iq]);
if(cl===null)miss.push('ёмкость нижнего ключа или диода');
if(qrr===null)miss.push('обратное восстановление');
if(dcr===null)miss.push('DCR дросселя');
if(pco===null)miss.push('потери в сердечнике');
if(iq===null)miss.push('ток контроллера');
var pt=0,k=0;for(var j=0;j<a.length;j++){pt+=a[j][1];if(a[j][1]>a[k][1])k=j;}
var po=vo*io,eta=po/(po+pt);
if(![d,di,pt,eta].every(isFinite))return err('Значения вне диапазона надёжного расчёта.');
var h=row('Схема',s?'синхронная, два MOSFET':'верхний MOSFET и диод')+
 row('Коэффициент заполнения D с учётом падений',fmt(d,4)+' (идеальный Vout / Vin = '+fmt(vo/vin,4)+')')+
 row('Размах тока дросселя ΔI',si(di,'А')+(lm?' — по индуктивности':' — задан'))+
 row('Ток дросселя: впадина / пик',si(iv,'А')+' / '+si(ip,'А'))+
 row('Действующий ток дросселя',si(ilr,'А'))+
 row('Действующий ток верхнего ключа',si(Math.sqrt(d*i2),'А'))+
 (s?row('Действующий ток нижнего ключа',si(Math.sqrt((1-d)*i2),'А')):row('Средний ток диода',si(io*(1-d),'А')));
if(q)h+=row('Ток затвора на плато: включение / выключение',si(ign,'А')+' / '+si(igf,'А'));
h+=row('Фронты верхнего ключа: включение / выключение',si(ton,'с')+' / '+si(toff,'с'));
for(var m=0;m<a.length;m++)h+=row('Потери: '+a[m][0],si(a[m][1],'Вт')+' — '+fmt(100*a[m][1]/pt,3)+' %');
if(miss.length)h+=row('Не заданы и не учтены',miss.join(', '));
h+=row('Сумма потерь',si(pt,'Вт'))+row('Выходная мощность Vout·Iout',si(po,'Вт'))+row('Входная мощность',si(po+pt,'Вт'))+row('КПД',fmt(100*eta,4)+' %')+
 row('Верхний ключ — для расчёта нагрева','Iд = '+si(Math.sqrt(d*i2),'А')+', потери, не зависящие от Rds(on), — '+si(psw+pco2+prr,'Вт'))+
 (s?row('Нижний ключ — для расчёта нагрева','Iд = '+si(Math.sqrt((1-d)*i2),'А')+', мёртвое время — '+si(pdt,'Вт')):row('Диод — потери проводимости',si(p2,'Вт')));
var st='Оценка: КПД ≈ '+fmt(100*eta,4)+' %, главная статья потерь — '+a[k][0]+' ('+fmt(100*a[k][1]/pt,3)+' % потерь)'+(miss.length?'; не заданы и не учтены: '+miss.join(', '):'');
var n='Переключение посчитано линейной аппроксимацией фронтов: за фронт на ключе одновременно напряжение Vin и ток, энергия ½·Vin·I·t (Infineon, ROHM); ключ включается при токе впадины, выключается при пиковом. ';
if(q)n+='Время фронта — заряд Qgs2 + Qgd, делённый на ток затвора на плато (TI SLVAEQ9); на самом деле ток затвора за время Qgs2 немного больше, чем на плато, и время чуть меньше. ';
n+=s?'Нижний ключ переключается при почти нулевом напряжении — ток переходит между каналом и внутренним диодом, — поэтому его потери переключения не учитываются (TI). ':'Ёмкость и заряд диода заряжаются при включении верхнего ключа — эти потери входят в статьи Coss и обратного восстановления. ';
n+='Rds(on) берётся как введено, при рабочей температуре; нагрев ключа с ростом Rds(on) считает страница нагрева MOSFET. Coss зависит от напряжения, поэтому статья Coss — оценка. Не учтены индуктивность общего истока (TI SLPA009), звон и снабберы, ESR конденсаторов, сопротивление дорожек, питание драйвера от Vin через линейный стабилизатор (тогда затворы берут Qg·Vin·fsw).';
out(h+row('Статус',st)+note(n));
}
''',
about="""<div class="formula">Синхронная схема: D = (Vout + Iout·(R2 + DCR)) / (Vin − Iout·R1 + Iout·R2)<br>С диодом: D = (Vout + Vf + Iout·DCR) / (Vin − Iout·R1 + Vf)<br>ΔI = (Vin − Vout)·D / (fsw·L),&nbsp;&nbsp;Iд,др = √(Iout² + ΔI²/12),&nbsp;&nbsp;Iд1 = √D·Iд,др,&nbsp;&nbsp;Iд2 = √(1 − D)·Iд,др<br>Pпров1 = Iд1²·R1,&nbsp;&nbsp;Pпров2 = Iд2²·R2,&nbsp;&nbsp;Pдиода = Vf·Iout·(1 − D)<br>Pпер = ½·Vin·fsw·(Iвп·tвкл + Iпик·tвыкл),&nbsp;&nbsp;tвкл = (Qgs2 + Qgd)·Rвкл / (Vдр − Vпл),&nbsp;&nbsp;tвыкл = (Qgs2 + Qgd)·Rвыкл / Vпл<br>PCoss = ½·(Coss1 + C2)·Vin²·fsw,&nbsp;&nbsp;PQrr = Qrr·Vin·fsw,&nbsp;&nbsp;Pмёртв = Vsd·2·Iout·tм·fsw<br>Pзатв = (Qg1 + Qg2)·Vдр·fsw,&nbsp;&nbsp;PDCR = Iд,др²·DCR,&nbsp;&nbsp;Pконтр = Vin·Iq,&nbsp;&nbsp;КПД = Vout·Iout / (Vout·Iout + ΣP)</div>
<p><b>Откуда статьи потерь.</b> TI в руководстве SLVA390A называет три главные причины потерь в понижающем преобразователе: проводимость дросселя, проводимость ключей и переключение. ROHM в руководстве 64AN035E даёт полный перечень для синхронной схемы: проводимость верхнего и нижнего ключей, переключение верхнего, заряд выходной ёмкости Coss, мёртвое время, заряд затворов и собственное потребление контроллера, а для схемы с диодом — прямое падение диода Vf·Iout·(1 − D). Калькулятор суммирует статьи и делит выходную мощность на входную. Потери в сердечнике дросселя, его DCR и ток контроллера вводятся по паспортам; пустое поле не подменяется числом, а попадает в список «не учтены».</p>
<p><b>Коэффициент заполнения.</b> В установившемся режиме среднее напряжение на дросселе равно нулю — то же равенство вольт-секунд, из которого на <a href="buck-boost-duty.html">странице коэффициента заполнения</a> выведено D = Vout/Vin. Если учесть падения — I·R1 на верхнем ключе, I·R2 или Vf на нижнем ключе или диоде, I·DCR на обмотке, — получаются формулы в рамке: D немного больше идеального. Размах тока — формула TI SLVA477B. Ток дросселя — треугольник вокруг Iout с размахом ΔI; его действующее значение √(Iout² + ΔI²/12), верхний ключ проводит долю периода D, нижний — 1 − D, отсюда √D и √(1 − D).</p>
<p><b>Переключение.</b> Пока верхний ключ переключается, на нём одновременно и напряжение, и ток. Если фронты считать линейными, за фронт теряется ½·Vin·I·t — так считают ROHM и Infineon. Infineon берёт токи в моменты переключения: в понижающей схеме ключ включается при токе впадины Iout − ΔI/2, а выключается при пиковом Iout + ΔI/2. Время фронта можно ввести по измерению или рассчитать по зарядам затвора: на интервале Qgs2 растёт ток, на плато Миллера Qgd спадает напряжение (TI SLVAEQ9: t = Qgs2/Ig и Qgd/Ig). Ток затвора на плато — (Vдр − Vпл)/Rвкл при включении и Vпл/Rвыкл при выключении; его подробный расчёт — на <a href="rezistor-zatvora-mosfet.html">странице резистора затвора</a>. Нижний ключ переключается при почти нулевом напряжении: ток переходит между каналом и внутренним диодом в мёртвое время, поэтому его потери переключения не учитываются.</p>
<p><b>Ёмкости, мёртвое время, восстановление.</b> При каждом включении верхний ключ разряжает свою выходную ёмкость: ½·Coss·Vin²·fsw (ROHM, Coss = Cds + Cgd). Одновременно через его канал до Vin заряжается ёмкость нижнего ключа или диода; при заряде ёмкости от источника через сопротивление теряется половина взятой энергии, отсюда ½·C2·Vin²·fsw. Microchip (AN1471) учитывает заряд Coss обоих ключей, ROHM — только верхнего, поэтому ёмкость нижнего — необязательное поле. Coss зависит от напряжения, а паспорт даёт её при одном напряжении сток–исток, так что эта статья — оценка. В мёртвое время ток дросселя идёт через внутренний диод нижнего ключа: ROHM считает Vsd·Iout·(tDr + tDf)·fsw, при одинаковом мёртвом времени на обоих фронтах это 2·Vsd·Iout·tм·fsw. Если задан Qrr, учитывается и обратное восстановление диода — Qrr·Vin·fsw в верхнем ключе, как в формуле энергии включения Infineon.</p>
<p><b>Затворы и контроллер.</b> Каждый период драйвер заряжает затворы: Qg·Vдр·fsw на каждый ключ (ROHM, TI SLUA618). Эта мощность рассеивается в драйвере и резисторах цепи затвора, а не в канале ключа. Собственное потребление контроллера Vin·Iq (ROHM) заметно при малой нагрузке. Если драйвер питается от Vin через линейный стабилизатор, затворы фактически берут Qg·Vin·fsw — калькулятор считает по напряжению драйвера.</p>
<p><b>Чем отличается от соседних страниц.</b> <a href="buck-boost-duty.html">Калькулятор коэффициента заполнения</a> даёт идеальное отношение напряжений без потерь, <a href="drossel-impulsnogo.html">калькулятор дросселя</a> подбирает индуктивность по допустимым пульсациям. Эта страница при уже выбранных ключах и дросселе показывает, куда уходит мощность. Потери верхнего и нижнего ключей и их действующие токи переносят на страницу <a href="nagrev-mosfet.html">нагрева MOSFET</a>: там Rds(on) пересчитывается по температуре кристалла, а тепловой режим проверяется по Tj max.</p>
<p><b>Что не учтено.</b> Индуктивность общего истока (её разбирает TI SLPA009), звон на фронтах и потери в снабберах, ESR входного и выходного конденсаторов, сопротивление дорожек, зависимость потерь переключения от температуры, разрывный режим. Изоляцию, пути утечки и зазоры калькулятор не считает — если преобразователь питается от выпрямленной сети, их требования берут из норм на изделие.</p>""",
example="""<p>Условный синхронный преобразователь 12 → 3,3 В, 5 А, 500 кГц, дроссель 3,3 мкГн с DCR 10 мОм. Верхний ключ: 8 мОм при рабочей температуре, Qg 10 нКл, Qgs2 2 нКл, Qgd 3 нКл, плато 3 В, Coss 300 пФ; нижний: 4 мОм, Qg 20 нКл, Coss 600 пФ. Драйвер 5 В, сопротивление цепи затвора 3 Ом при включении и 2 Ом при выключении, мёртвое время 20 нс, Vsd 0,8 В, контроллер потребляет 2 мА. Все значения условные.</p>
<p>Коэффициент заполнения с учётом падений — 0,2813 вместо идеальных 0,275. Размах тока (12 − 3,3)·0,2813 / (500 кГц · 3,3 мкГн) = 1,483 А, действующий ток верхнего ключа 2,662 А, нижнего — 4,254 А. Ток затвора на плато — (5 − 3)/3 = 0,6667 А при включении и 3/2 = 1,5 А при выключении, фронты 7,5 и 3,333 нс. Потери: DCR дросселя 251,8 мВт, переключение верхнего ключа 153,2 мВт, мёртвое время 80 мВт, затворы 75 мВт, проводимость нижнего ключа 72,4 мВт и верхнего 56,67 мВт, Coss 32,4 мВт, контроллер 24 мВт — всего 745,5 мВт, <b>КПД 95,68 %</b>. Главная статья — DCR дросселя; обратное восстановление и сердечник не заданы и в сумму не вошли, о чём сказано в результате.</p>
<p>Та же схема с диодом (Vf 0,45 В) вместо нижнего ключа: D = 0,3062, средний ток диода 3,469 А, его потери 1,561 Вт — 74 % всех потерь, <b>КПД 88,67 %</b>. При низком выходном напряжении диод проводит большую часть периода, и синхронный ключ выгоднее.</p>""",
faqs=[
 ("Почему расчётный КПД выше измеренного?",
  "Часть потерь калькулятор не видит: звон и снабберы, ESR конденсаторов, дорожки, индуктивность общего истока, а пустые необязательные поля — DCR, сердечник, ток контроллера — не учитываются вовсе, и об этом сказано в результате. Кроме того, Rds(on) и Coss в паспорте даны для своих условий. Расчёт показывает, какая статья главная, — уточнять её стоит измерением."),
 ("Что выгоднее — синхронная схема или диод?",
  "Диод теряет Vf·Iout·(1 − D): при низком выходном напряжении D мало, диод проводит почти весь период, и его потери велики. Синхронный ключ вместо этого теряет I²·Rds(on) и мёртвое время. Сравните обе схемы переключателем с одинаковыми остальными данными."),
 ("Где взять Qgs2 и напряжение плато?",
  "Из графика заряда затвора в паспорте: Qgs2 — участок от порогового напряжения до начала плато, Qgd — длина плато, напряжение плато — его высота при токе, близком к вашему. В паспортах Infineon (IR) Qgs2 указан отдельно или в составе Qsw = Qgs2 + Qgd."),
 ("Как перейти к нагреву ключа?",
  "В результате есть строки «для расчёта нагрева»: действующий ток ключа и потери, не зависящие от Rds(on). Их вводят на странице нагрева MOSFET — там потери проводимости пересчитываются с ростом Rds(on) по температуре кристалла."),
],
related=["buck-boost-duty", "drossel-impulsnogo", "nagrev-mosfet", "rezistor-zatvora-mosfet", "raschet-radiatora"],
review_status="estimate",
sources=[
 dict(TI_SLVA390, sections=["три главные причины потерь: проводимость дросселя, проводимость ключей, переключение", "пошаговый расчёт КПД и потерь"]),
 dict(ROHM_BUCK, sections=["P_SW-H = ½·VIN·IOUT·(tr + tf)·fSW", "P_COSS = ½·COSS-H·VIN²·fSW, COSS-H = CDS-H + CGD-H", "P_ON-D = IOUT·VF·(1 − VOUT/VIN)", "проводимость верхнего ключа — по доле D, нижнего — по 1 − D", "потери заряда затворов верхнего и нижнего ключей — Qg·VGS·fSW"]),
 dict(ROHM_TECHWEB, sections=["мёртвое время: PD = VD·IO·(tDr + tDf)·fSW", "заряд затвора: Qg × напряжение драйвера × частота", "контроллер: напряжение питания × ток потребления"]),
 dict(INFINEON_LOSSES, sections=["EonM = UDD·IDon·(tri + tfu)/2 + Qrr·UDD; EoffM = UDD·IDoff·(tru + tfi)/2", "PswM = (EonM + EoffM)·fsw; PCM = RDSon·IDrms²"]),
 dict(TI_SLVAEQ9, sections=["интервалы переключения: t = QGS2/IG и QGD/IG", "нижний ключ переключается при нулевом напряжении — его потери переключения пренебрежимо малы", "потери ключей: переключение, проводимость, заряд затвора, Coss, внутренний диод нижнего ключа в мёртвое время"]),
 dict(MCHP_AN1471, sections=["выходная ёмкость COSS = CGD + CDS обоих ключей заряжается каждый период", "сопротивления драйвера и затвора в расчёте времени переключения"]),
 dict(TI_SLVA477, sections=["ΔIL = (VIN − VOUT)·D / (fS·L)"]),
 dict(TI_SLPA009, sections=["индуктивность общего истока в синхронном buck — на этой странице не учитывается"]),
 dict(NEXPERIA_AN11158, sections=["с ростом VDS растут QGD и QG(tot) — плато Миллера длиннее"]),
 dict(title="IRF7834PbF HEXFET Power MOSFET. Data Sheet",
      organization="International Rectifier (ныне Infineon)",
      edition="редакция 9/21/04 по выдаче; обозначения видны в выдаче, как и в других паспортах HEXFET",
      sections=["Qgs2 — заряд затвор–исток после порога (Post-Vth)", "Qsw — заряд переключения, Qgs2 + Qgd"],
      accessed=ACCESSED,
      url="https://www.infineon.com/assets/row/public/documents/24/49/infineon-irf7834-datasheet-en.pdf?fileId=5546d462533600a40153560c2e5c1d1f"),
],
assumptions=[
 "Непрерывный ток дросселя, линейные пульсации; ток впадины больше нуля.",
 "Rds(on), Vf, Vsd, Coss, Qg, Qgs2, Qgd вводятся по паспорту для рабочих условий; Rds(on) — уже при рабочей температуре.",
 "Фронты переключения линейные: энергия ½·Vin·I·t; ток затвора за фронт равен току на плато Миллера.",
 "Нижний ключ переключается при нулевом напряжении; мёртвое время одинаково на обоих фронтах.",
 "D — из равенства вольт-секунд с падениями на ключах, диоде и DCR; ΔI — по формуле TI SLVA477B.",
],
limitations=[
 "Не учитываются индуктивность общего истока, звон и снабберы, ESR конденсаторов, сопротивление дорожек.",
 "Coss нелинейна; паспортное значение при одном напряжении даёт оценку, а не точный расчёт.",
 "Разрывный режим и режимы с отрицательным током дросселя не рассматриваются.",
 "Изоляцию, пути утечки и зазоры калькулятор не считает.",
],
),

# ─── 2. RCD-снаббер (кламп) обратноходового преобразователя ──────────────────
# Видно в выдаче: Fairchild AN-4147 (Rev. 1.1.0 по выдаче, 2006) — выброс от
# резонанса индуктивности рассеяния Llk с Coss ключа, лавинный пробой без
# ограничения; Vsn эмпирически около 2–2,5·nVo; пульсации 5–10 %; наибольшее
# Vds — ниже 90 % и 80 % BVdss в переходном и установившемся режиме (два
# поиска); диод клампа — сверхбыстрый, номинал выше BVdss, обычно 1 А (два
# поиска). Формулы — в публикации методики на EDN: Psn = ½·Llk·Ipk²·fs·
# Vsn/(Vsn − nVo), Rsn = Vsn²/Psn, ΔVsn = Vsn/(Csn·Rsn·fs). ADI DS32 (один
# поиск, в пересказе): R = Vclamp·(Vclamp − Vref)/(fs·Elk) — то же, что
# Vsn²/Psn. TI (Kollman, Power Tips #17, два поиска): потери всегда больше
# энергии рассеяния, снижение напряжения клампа отнимает мощность у выхода; при
# Vclamp/Vreset = 1,5 — почти втрое, это множитель Vsn/(Vsn − Vor) = 3.
# TI SLUP338: рассеяние измеряют на первичной обмотке при закороченной
# вторичной. Vor = n·(Vo + Vf) — определение из брифа; пик на ключе — с
# половиной пульсаций клампа (вывод на странице). Статус estimate.
dict(
slug="rcd-snabber-flyback", cat="elektronika",
name="RCD-снаббер обратноходового преобразователя",
h2_topic="RCD-снаббер обратноходового преобразователя",
short="Кламп на стоке: мощность, резистор и конденсатор по пульсациям, напряжение на ключе против VDSS",
title="RCD-снаббер (кламп) обратноходового преобразователя: мощность, R, C и напряжение на ключе",
desc="Расчёт RCD-снаббера (клампа) обратноходового преобразователя по методике Fairchild AN-4147: мощность ½·Llk·Ipk²·f·Vsn/(Vsn − Vor), резистор Vsn²/P, конденсатор по допустимым пульсациям, наибольшее напряжение на ключе против VDSS с запасом и требования к диоду клампа.",
intro='RCD-кламп ограничивает выброс на стоке ключа обратноходового преобразователя: он принимает энергию индуктивности рассеяния трансформатора и рассеивает её в резисторе. Калькулятор считает мощность, резистор, конденсатор и проверяет напряжение на ключе. Звон на фронте гасит другая цепь — <a href="snabber-rc.html">RC-снаббер по частоте звона</a>.',
kw="rcd снаббер rcd кламп обратноходовый преобразователь flyback индуктивность рассеяния выброс на стоке напряжение клампа отражённое напряжение vor резистор снаббера конденсатор снаббера an-4147",
fields=[
 dict(id="llk", label="Индуктивность рассеяния первичной обмотки Llk", unit="мкГн", val="10", hint="Измеряют LCR-метром на первичной обмотке обесточенного трансформатора при закороченной вторичной (так в TI SLUP338). Индуктивность монтажа добавляется к ней, поэтому реальная энергия больше"),
 dict(id="ipk", label="Пиковый ток первичной обмотки Ipk", unit="А", val="1,2", hint="Наибольший — при наименьшем входном напряжении и полной нагрузке, по расчёту трансформатора"),
 dict(id="fsw", label="Частота переключения fsw", unit="кГц", val="65"),
 dict(type="select", id="vm", label="Отражённое напряжение Vor", opts=[
  ("vor","Задать Vor"),
  ("n","Рассчитать: Vor = n·(Vo + Vf)")], val="vor"),
 dict(id="vor", label="Отражённое напряжение Vor", unit="В", val="100", hint="Напряжение вторичной цепи, приведённое к первичной обмотке"),
 dict(id="n", label="Коэффициент трансформации n = Np / Ns", val="5"),
 dict(id="vo", label="Выходное напряжение Vo", unit="В", val="19"),
 dict(id="vf", label="Прямое напряжение выходного диода Vf", unit="В", val="1"),
 dict(id="vsn", label="Выбранное напряжение клампа Vsn — на конденсаторе снаббера", unit="В", val="200", hint="Должно быть больше Vor. AN-4147: эмпирически около 2–2,5 Vor"),
 dict(id="rip", label="Допустимые пульсации на конденсаторе клампа", unit="% от Vsn", val="10", hint="AN-4147: 5–10 % — разумно. Калькулятор принимает до 20 %: формула пульсаций — приближение малых пульсаций"),
 dict(id="vinmax", label="Наибольшее постоянное входное напряжение Vin max", unit="В", val="375", hint="Для выпрямленной сети — амплитуда наибольшего напряжения сети, например 265 В · √2 ≈ 375 В"),
 dict(id="vdss", label="Напряжение сток–исток VDSS ключа по паспорту", unit="В", val="800", hint="Пустое поле — «Недостаточно данных»: напряжение на ключе не с чем сравнить"),
 dict(id="kv", label="Допустимая доля VDSS в установившемся режиме", unit="%", val="80", hint="AN-4147 (Fairchild): наибольшее Vds — не выше 80 % VDSS в установившемся режиме и 90 % в переходных. Можно задать свой запас"),
],
js=R_JS + r'''
function sync(){var n=S('vm')==='n';hideF('vor',n);hideF('n',!n);hideF('vo',!n);hideF('vf',!n);}
function init(){$('vm').addEventListener('change',sync);sync();}
function calc(){
var nm=S('vm')==='n',llk=P('llk'),ipk=P('ipk'),f=P('fsw'),vsn=P('vsn'),rip=P('rip'),vin=P('vinmax'),kv=P('kv'),vds=OPT('vdss'),vor;
if([llk,ipk,f,vsn,rip,vin,kv].some(isNaN))return err('Заполните числами индуктивность рассеяния, пиковый ток, частоту, напряжение клампа, пульсации, наибольшее входное напряжение и допустимую долю VDSS.');
if(llk<=0||ipk<=0||f<=0||vsn<=0||vin<=0)return err('Индуктивность, ток, частота и напряжения должны быть больше нуля.');
if(rip<=0||rip>20)return err('Пульсации на конденсаторе клампа — больше 0 и не больше 20 % от Vsn: формула ΔV = Vsn / (R·C·f) — приближение малых пульсаций; AN-4147 считает разумными 5–10 %.');
if(kv<=0||kv>100)return err('Допустимая доля VDSS — больше 0 и не больше 100 %.');
if(nm){var nn=P('n'),vo=P('vo'),vf=P('vf');
 if([nn,vo,vf].some(isNaN))return err('Введите коэффициент трансформации, выходное напряжение и прямое напряжение выходного диода.');
 if(nn<=0||vo<=0)return err('Коэффициент трансформации и выходное напряжение должны быть больше нуля.');
 if(vf<0)return err('Прямое напряжение диода не может быть отрицательным.');
 vor=nn*(vo+vf);}
else{vor=P('vor');if(isNaN(vor))return err('Введите отражённое напряжение Vor.');if(vor<=0)return err('Отражённое напряжение должно быть больше нуля.');}
if(vds!==null){if(isNaN(vds))return err('VDSS — число в вольтах. Если его нет, оставьте поле пустым.');if(vds<=0)return err('VDSS должно быть больше нуля.');}
if(!gt(vsn,vor))return err('Напряжение клампа Vsn = '+fmt(vsn)+' В не выше отражённого Vor = '+fmt(vor)+' В. Тогда кламп открывается уже отражённым напряжением: ток индуктивности рассеяния не спадает, вторичная обмотка не принимает энергию, и каждый период энергия трансформатора уходит в резистор клампа вместо выхода. Выберите Vsn выше Vor — AN-4147 рекомендует около 2–2,5 Vor.');
var L=llk*1e-6,F=f*1e3,ts=L*ipk/(vsn-vor);
if(!(ts<1/F))return err('Ток индуктивности рассеяния спадал бы '+si(ts,'с')+' — не меньше периода '+si(1/F,'с')+': Vsn слишком близко к Vor. Поднимите напряжение клампа.');
var e=0.5*L*ipk*ipk,p=e*F*vsn/(vsn-vor),r=vsn*vsn/p,dv=rip/100*vsn,c=vsn/(dv*r*F),vcp=vsn+dv/2,vd=vin+vcp,k=vsn/vor,lim=vds===null?NaN:kv/100*vds;
if(![ts,p,r,c,vd].every(isFinite))return err('Значения вне диапазона надёжного расчёта.');
var h=nm?row('Отражённое напряжение Vor = n·(Vo + Vf)',fmt(vor)+' В'):'';
h+=row('Отношение Vsn / Vor',(lt(k,2)?fx(k,2):(gt(k,2.5)?fx(k,2.5):fmt(k,3)))+(lt(k,2)?' — ниже диапазона 2–2,5 из AN-4147: потери снаббера растут':(gt(k,2.5)?' — выше диапазона 2–2,5 из AN-4147: выше напряжение на ключе':' — в диапазоне 2–2,5 из AN-4147')))+
 row('Время спада тока рассеяния ts = Llk·Ipk / (Vsn − Vor)',si(ts,'с'))+
 row('Энергия рассеяния за период ½·Llk·Ipk²',si(e,'Дж'))+
 row('Мощность снаббера P = ½·Llk·Ipk²·fsw·Vsn / (Vsn − Vor)',si(p,'Вт'))+
 row('Из неё сверх энергии рассеяния — отнято у выхода',si(p-e*F,'Вт'))+
 row('Резистор Rsn = Vsn² / P',si(r,'Ом')+', мощность не меньше '+si(p,'Вт'))+
 row('Конденсатор Csn = Vsn / (ΔV·Rsn·fsw)',si(c,'Ф')+' при пульсациях ΔV = '+fmt(dv)+' В')+
 row('Наибольшее напряжение на конденсаторе Vsn + ΔV/2',fmt(vcp)+' В')+
 row('Наибольшее напряжение на ключе Vin max + Vsn + ΔV/2',(vds===null?fmt(vd):fx(vd,lim))+' В')+
 row('Диод клампа','сверхбыстрый; обратное напряжение '+(vds===null?'не ниже '+fmt(vd)+' В при открытом ключе':'выше VDSS ключа '+fmt(vds)+' В (AN-4147)')+'; пиковый ток '+si(ipk,'А')+', средний '+si(p/vsn,'А'));
if(vds!==null)h+=row(fmt(kv)+' % VDSS',fx(lim,vd)+' В');
var st;
if(vds===null)st='Недостаточно данных: VDSS ключа не задано — расчётное наибольшее напряжение на ключе '+fmt(vd)+' В не с чем сравнить';
else if(gt(vd,vds))st='Расчётное напряжение на ключе '+fx(vd,vds)+' В больше VDSS '+fx(vds,vd)+' В';
else if(gt(vd,lim))st='Запас по напряжению меньше заданного: расчётное напряжение на ключе '+fx(vd,lim)+' В — больше '+fmt(kv)+' % VDSS = '+fx(lim,vd)+' В';
else st='Оценка: расчётное наибольшее напряжение на ключе '+fx(vd,lim)+' В не больше '+fmt(kv)+' % VDSS = '+fx(lim,vd)+' В';
var n='Ток индуктивности рассеяния спадает под напряжением Vsn − Vor: вторичная обмотка в это время держит первичную на Vor. Поэтому в кламп уходит больше энергии рассеяния — множитель Vsn / (Vsn − Vor), и чем ближе Vsn к Vor, тем больше мощности кламп отнимает у выхода (TI, Kollman: при отношении 1,5 — почти втрое). ';
n+='AN-4147 (Fairchild): Vsn — эмпирически около 2–2,5 Vor, пульсации 5–10 %, наибольшее Vds — не выше 80 % VDSS в установившемся режиме и 90 % в переходных; диод клампа — сверхбыстрый, с номиналом выше VDSS ключа. ';
n+='Напряжение на ключе считается по AN-4147: Vin max плюс напряжение клампа. При наибольшем входном напряжении пиковый ток обычно меньше, и Vsn с тем же резистором ниже заданного; индуктивность монтажа, звон и прямое восстановление диода, наоборот, добавляют выброс, а переходные режимы — пуск, скачок нагрузки — не считаются. Окончательно пик подтверждают измерением на макете; на сетевом преобразователе его выполняет квалифицированный специалист по правилам работы с сетевыми цепями. Изоляцию трансформатора, пути утечки и зазоры калькулятор не считает.';
out(h+row('Статус',st)+note(n));
}
''',
about="""<div class="formula">ts = Llk·Ipk / (Vsn − Vor),&nbsp;&nbsp;Vor = n·(Vo + Vf)<br>P = ½·Llk·Ipk²·fsw · Vsn / (Vsn − Vor)<br>Rsn = Vsn² / P,&nbsp;&nbsp;ΔV = Vsn / (Csn·Rsn·fsw)&nbsp;&nbsp;⇒&nbsp;&nbsp;Csn = Vsn / (ΔV·Rsn·fsw)<br>Vds,max ≈ Vin,max + Vsn + ΔV/2 ≤ k·VDSS;&nbsp;&nbsp;обязательно Vsn > Vor</div>
<p><b>Откуда выброс.</b> Когда ключ обратноходового преобразователя закрывается, ток намагничивания переходит во вторичную обмотку, а ток индуктивности рассеяния Llk — нет: у неё нет связи со вторичной стороной. Этот ток заряжает выходную ёмкость ключа, и индуктивность рассеяния резонирует с Coss — на стоке появляется высокий выброс, который без ограничения может довести ключ до лавинного пробоя (Fairchild, AN-4147). RCD-кламп — диод, конденсатор и резистор: когда напряжение на стоке превышает Vin + Vsn, диод открывается, и ток рассеяния уходит в конденсатор, а резистор рассеивает накопленную энергию.</p>
<p><b>Мощность клампа.</b> Пока диод открыт, на первичной обмотке Vsn, а вторичная держит её на отражённом напряжении Vor. На индуктивности рассеяния остаётся Vsn − Vor, и её ток спадает от Ipk до нуля линейно за ts = Llk·Ipk / (Vsn − Vor). Энергия, ушедшая в кламп за период, — Vsn·Ipk·ts/2 = ½·Llk·Ipk²·Vsn / (Vsn − Vor), а мощность — это, умноженное на частоту. Так считает AN-4147 (формулы видны в её публикации на EDN). Множитель Vsn / (Vsn − Vor) всегда больше единицы: кламп берёт не только энергию рассеяния, но и часть энергии, которая шла бы на выход. TI (Kollman, Power Tips #17) подчёркивает, что потери клампа всегда больше энергии рассеяния и зависят от напряжения клампа: при отношении напряжения клампа к отражённому 1,5 — почти втрое, ровно множитель 1,5 / 0,5 = 3. В заметке Analog Devices DS32 (в пересказе выдачи) сопротивление записано как R = Vclamp·(Vclamp − Vref) / (fsw·Elk) — то же самое, что Vsn² / P.</p>
<p><b>Почему Vsn обязано быть больше Vor.</b> Если напряжение клампа не выше отражённого, кламп открывается уже отражённым напряжением: множитель Vsn / (Vsn − Vor) уходит в бесконечность, ток рассеяния не спадает, напряжение на вторичной обмотке не достигает Vo + Vf, и выходной диод не открывается. Тогда каждый период энергия, накопленная в трансформаторе, сбрасывается в резистор клампа вместо выхода. Kollman (TI): чем ниже напряжение на стоке, тем больше мощности кламп отнимает у выхода. Поэтому калькулятор при Vsn ≤ Vor не считает R и C, а сообщает об ошибке. AN-4147 эмпирически рекомендует Vsn около 2–2,5 Vor: выше — меньше потерь, но больше напряжение на ключе.</p>
<p><b>Конденсатор и пульсации.</b> Конденсатор заряжается коротким импульсом в начале закрытого состояния и весь период разряжается через резистор. При малых пульсациях разряд почти линеен: ΔV = Vsn / (Csn·Rsn·fsw) (AN-4147), отсюда ёмкость. Разумными AN-4147 считает пульсации 5–10 %. Vsn — среднее напряжение клампа, поэтому наибольшее — около Vsn + ΔV/2; оно и складывается с входным напряжением на стоке.</p>
<p><b>Напряжение на ключе и диод.</b> Наибольшее напряжение на закрытом ключе по расчёту — Vin,max + Vsn + ΔV/2. AN-4147 требует проверить, что наибольшее Vds не выше 90 % VDSS в переходных режимах и 80 % в установившемся; это рекомендация Fairchild, а не норма, и калькулятор проверяет установившийся режим с запасом, который вы задаёте. Расчёт складывает наибольшее входное напряжение с напряжением клампа, хотя при высоком входном напряжении пиковый ток и Vsn обычно ниже, а индуктивность монтажа добавляет выброс — поэтому вывод относится к расчётному напряжению, а пик подтверждают измерением. Без VDSS вывод — «Недостаточно данных». Диод клампа по AN-4147 — сверхбыстрый, с номинальным напряжением выше VDSS ключа, обычно на ток 1 А; его пиковый ток равен Ipk, средний — P / Vsn. При открытом ключе диод заперт напряжением Vin плюс напряжение конденсатора.</p>
<p><b>Исходные данные.</b> Индуктивность рассеяния измеряют LCR-метром на первичной обмотке обесточенного трансформатора при закороченной вторичной — так её измеряет TI в SLUP338. Индуктивность монтажа контура ключа добавляется к ней. Мощность клампа наибольшая при наибольшем пиковом токе — при наименьшем входном напряжении и полной нагрузке, а напряжение на ключе — при наибольшем входном; калькулятор совмещает оба худших случая.</p>
<p><b>Чем отличается от RC-снаббера.</b> <a href="snabber-rc.html">RC-снаббер</a> подбирается по измеренной частоте звона и гасит колебания; RCD-кламп ограничивает уровень выброса, принимая энергию рассеяния. Они дополняют друг друга. Потери самого ключа считает страница <a href="nagrev-mosfet.html">нагрева MOSFET</a>, скорость его переключения — страница <a href="rezistor-zatvora-mosfet.html">резистора затвора</a>. Сам трансформатор — отражённое напряжение, индуктивность первичной обмотки и пиковый ток — прикидывает <a href="transformator-flyback.html">калькулятор трансформатора flyback</a>.</p>
<p><b>Изоляция и измерения.</b> Обратноходовые преобразователи часто питаются от выпрямленной сети. Изоляцию трансформатора, пути утечки и зазоры калькулятор не считает — их требования задают нормы на изделие. Пик напряжения на макете проверяет квалифицированный специалист по правилам работы с сетевыми цепями; расчёт измерение не заменяет.</p>""",
example="""<p>Условный обратноходовый преобразователь от сети до 265 В: Vin max = 375 В, частота 65 кГц, пиковый ток первичной обмотки 1,2 А, измеренная индуктивность рассеяния 10 мкГн, Vor = 100 В. Кламп на Vsn = 200 В (2·Vor): ток рассеяния спадает за 10 мкГн · 1,2 А / 100 В = 120 нс, энергия рассеяния 7,2 мкДж, мощность клампа 7,2 мкДж · 65 кГц · 200 / 100 = <b>0,936 Вт</b> — вдвое больше энергии рассеяния, умноженной на частоту. Резистор 200² / 0,936 = <b>42,74 кОм</b>, конденсатор при пульсациях 10 % (20 В) — 200 / (20 · 42,74 кОм · 65 кГц) = <b>3,6 нФ</b>. Наибольшее напряжение на ключе 375 + 200 + 10 = 585 В: с ключом на 800 В это 73 % VDSS, в пределах 80 % по AN-4147. С ключом на 650 В предел — 520 В, и запаса не хватает.</p>
<p>Если опустить кламп до 150 В (1,5·Vor), мощность вырастет до 1,404 Вт — втрое больше энергии рассеяния, как и пишет TI, — зато напряжение на ключе снизится до 532,5 В.</p>""",
faqs=[
 ("Почему напряжение клампа должно быть больше отражённого?",
  "Иначе кламп открывается уже отражённым напряжением: ток индуктивности рассеяния не спадает, выходной диод не открывается, и энергия трансформатора каждый период уходит в резистор клампа вместо выхода. При Vsn ≤ Vor калькулятор не считает снаббер и сообщает об ошибке."),
 ("Как выбрать напряжение клампа?",
  "AN-4147 эмпирически рекомендует около 2–2,5 Vor. Ниже — резко растут потери: множитель Vsn / (Vsn − Vor) при отношении 1,5 уже равен 3. Выше — растёт напряжение на ключе: Vin max + Vsn + ΔV/2 должно оставаться в пределах выбранной доли VDSS."),
 ("Чем RCD-кламп отличается от RC-снаббера?",
  "RC-снаббер гасит звон и подбирается по измеренной частоте колебаний. RCD-кламп ограничивает уровень выброса: диод открывается, когда напряжение на стоке выше Vin + Vsn, и энергия рассеяния уходит в конденсатор и резистор. В обратноходовом преобразователе их часто ставят вместе."),
 ("Почему мощность снаббера больше энергии рассеяния, умноженной на частоту?",
  "Пока ток рассеяния спадает, на первичной обмотке держится отражённое напряжение, и кламп получает энергию не только от индуктивности рассеяния, но и от трансформатора. Отсюда множитель Vsn / (Vsn − Vor); TI (Kollman) подчёркивает, что потери клампа всегда больше энергии рассеяния."),
],
related=["transformator-flyback", "snabber-rc", "nagrev-mosfet", "rezistor-zatvora-mosfet", "poteri-buck-preobrazovatelya"],
review_status="estimate",
sources=[
 dict(FCS_AN4147, sections=["выброс — резонанс индуктивности рассеяния с Coss ключа, без клампа возможен лавинный пробой", "Vsn эмпирически около 2–2,5·nVo; пульсации конденсатора 5–10 %", "наибольшее Vds — ниже 90 % и 80 % BVdss в переходном и установившемся режиме", "диод клампа — сверхбыстрый, номинал выше BVdss, обычно 1 А"]),
 dict(EDN_RCD, sections=["Psn = ½·Llk·Ipk²·fs·Vsn/(Vsn − nVo)", "Rsn = Vsn²/Psn; ΔVsn = Vsn/(Csn·Rsn·fs)"]),
 dict(ADI_DS32, sections=["R = Vclamp·(Vclamp − Vref)/(fs·Elk) — то же, что Vsn²/P"]),
 dict(TI_KOLLMAN, sections=["потери клампа всегда больше энергии рассеяния и зависят от напряжения клампа", "снижение напряжения клампа отнимает мощность у выхода", "при Vclamp/Vreset = 1,5 потери почти втрое больше энергии рассеяния"]),
 dict(TI_SLUP338, sections=["индуктивность рассеяния измеряют на первичной обмотке при закороченной вторичной"]),
],
assumptions=[
 "Ток индуктивности рассеяния спадает линейно под напряжением Vsn − Vor; вторичная обмотка в это время держит первичную на Vor.",
 "Конденсатор клампа разряжается резистором почти линейно — пульсации малы (не больше 20 % по ограничению калькулятора).",
 "Наибольшие пиковый ток (при наименьшем входном напряжении) и входное напряжение совмещены как худший случай.",
 "Vor = n·(Vo + Vf) или задано напрямую; Vsn — среднее напряжение клампа, наибольшее — Vsn + ΔV/2.",
],
limitations=[
 "Энергия выходной ёмкости ключа, индуктивность монтажа, звон и прямое восстановление диода не учитываются — реальный пик может быть выше расчётного.",
 "Переходные режимы (пуск, скачок нагрузки, замыкание на выходе) не считаются; для них AN-4147 допускает до 90 % VDSS.",
 "Стабилитронные, активные и бездиссипативные клампы не рассматриваются.",
 "Изоляцию трансформатора и драйвера, пути утечки и зазоры калькулятор не считает.",
],
),

# ─── 3. Нагрев MOSFET с учётом роста Rds(on) ─────────────────────────────────
# Видно в выдаче (два поиска): Infineon (Graovac и др., V1.1, 2006) и статья
# базы знаний Infineon — RDS(on)(Tj) = RDS(on)(25 °C)·(1 + α/100)^(Tj − 25),
# α — по двум точкам графика RDS(on) = f(Tj) из паспорта; PCM = RDSon·IDrms².
# onsemi AND9016 — цепочка Tj − Ta = P·(Rθjc + Rθcs + Rθsa) (та же, что на
# raschet-radiatora). Microsemi APT-0403: положительный ТКС Rds(on) усиливает
# потери I²R с нагревом. Замкнутое решение через функцию Ламберта, условие
# существования A·B < 1/e и петлевое усиление выведены на странице; страница
# решает уравнение делением отрезка, эталоны — итерацией T(k+1) = Ta + Rθ·P(Tk)
# и методом Ньютона для W-функции в scratchpad r/ref.py. Статус estimate.
dict(
slug="nagrev-mosfet", cat="elektronika",
name="Нагрев MOSFET с учётом роста Rds(on)",
h2_topic="Нагрев MOSFET",
short="Температура кристалла с ростом Rds(on) от нагрева, проверка теплового разгона и Tj max",
title="Нагрев MOSFET-ключа: температура кристалла с ростом Rds(on), тепловой разгон",
desc="Температура кристалла MOSFET-ключа с учётом роста Rds(on) при нагреве: модель Infineon Rds(on)(Tj) = R25·(1 + α/100)^(Tj − 25) по двум точкам графика паспорта, тепловая цепь Rθjc + Rθcs + Rθsa или Rθja, проверка теплового разгона и сравнение с Tj max.",
intro='Сопротивление открытого MOSFET растёт с нагревом, а с ним — потери проводимости и снова нагрев. Калькулятор находит установившуюся температуру кристалла с этой обратной связью, проверяет, есть ли она вообще, и сравнивает её с Tj max. Если мощность уже известна и нужно подобрать радиатор — это <a href="raschet-radiatora.html">расчёт радиатора</a>.',
kw="нагрев mosfet температура кристалла tj rds(on) от температуры тепловой разгон тепловое сопротивление rθjc rθja радиатор потери проводимости транзистора ключа расчёт температуры перехода",
fields=[
 dict(id="irms", label="Действующий ток через ключ Iд", unit="А", val="8", hint="Например, со страницы потерь buck-преобразователя — строка «для расчёта нагрева»"),
 dict(id="r25", label="Rds(on) при 25 °C по паспорту", unit="мОм", val="20", hint="Максимальное значение при вашем напряжении затвора"),
 dict(id="t2", label="Вторая температура на графике Rds(on) от Tj", unit="°C", val="150"),
 dict(id="k2", label="Нормированное Rds(on) при этой температуре", unit="о. е.", val="1,9", hint="Отношение Rds(on) при второй температуре к значению при 25 °C — по графику из паспорта"),
 dict(id="psw", label="Потери переключения и прочие, не зависящие от Rds(on)", unit="Вт", val="0,5", hint="Необязательное: например, со страницы потерь buck-преобразователя. Считаются постоянными"),
 dict(type="select", id="path", label="Путь отвода тепла", opts=[
  ("sink","Через радиатор: Rθjc + Rθcs + Rθsa"),
  ("ja","Без радиатора или через плату: Rθja")], val="sink"),
 dict(id="rjc", label="Тепловое сопротивление кристалл–корпус Rθjc", unit="°C/Вт", val="1", hint="По паспорту ключа"),
 dict(id="rcs", label="Тепловое сопротивление корпус–радиатор Rθcs", unit="°C/Вт", val="0,5", hint="По паспорту прокладки или пасты для вашей площади и толщины"),
 dict(id="rsa", label="Тепловое сопротивление радиатор–среда Rθsa", unit="°C/Вт", val="20", hint="По паспорту радиатора для вашего обдува и ориентации"),
 dict(id="rja", label="Тепловое сопротивление кристалл–среда Rθja", unit="°C/Вт", val="40", hint="По паспорту — для условий монтажа, указанных в нём"),
 dict(id="ta", label="Температура воздуха у радиатора или платы Ta", unit="°C", val="40"),
 dict(id="tjmax", label="Наибольшая температура кристалла Tj max", unit="°C", val="175", hint="По паспорту; можно задать свою, меньшую расчётную. Пустое поле — «Недостаточно данных»"),
],
js=R_JS + r'''
function sync(){var j=S('path')==='ja';hideF('rjc',j);hideF('rcs',j);hideF('rsa',j);hideF('rja',!j);}
function init(){$('path').addEventListener('change',sync);sync();}
function calc(){
var ja=S('path')==='ja',i=P('irms'),r25=P('r25'),t2=P('t2'),k2=P('k2'),ta=P('ta'),ps=OPT('psw'),tm=OPT('tjmax'),rt,rjc=NaN,rsa=NaN;
if([i,r25,t2,k2,ta].some(isNaN))return err('Заполните числами действующий ток, Rds(on) при 25 °C, вторую точку графика и температуру среды.');
if(i<=0||r25<=0)return err('Ток и Rds(on) должны быть больше нуля.');
if(t2<=25||t2>200)return err('Вторая точка графика Rds(on) от Tj — температура выше 25 °C и не выше 200 °C.');
if(k2<1||k2>5)return err('Нормированное Rds(on) во второй точке — от 1 до 5: у MOSFET сопротивление с нагревом растёт, а больших множителей калькулятор не принимает.');
if(ta<-55||ta>150)return err('Температура среды — от −55 до 150 °C.');
if(ps===null)ps=0;else{if(isNaN(ps))return err('Потери переключения — число в ваттах. Если их нет, оставьте поле пустым.');if(ps<0)return err('Потери переключения не могут быть отрицательными.');}
if(tm!==null){if(isNaN(tm))return err('Tj max — число в градусах. Если её нет, оставьте поле пустым.');if(!(tm>ta))return err('Tj max должна быть выше температуры среды.');if(tm>250)return err('Tj max — не выше 250 °C.');}
if(ja){rt=P('rja');if(isNaN(rt))return err('Введите тепловое сопротивление кристалл–среда.');if(rt<=0)return err('Тепловое сопротивление должно быть больше нуля.');}
else{rjc=P('rjc');var rcs=P('rcs');rsa=P('rsa');
 if([rjc,rcs,rsa].some(isNaN))return err('Введите тепловые сопротивления кристалл–корпус, корпус–радиатор и радиатор–среда.');
 if(rjc<0||rcs<0||rsa<0)return err('Тепловые сопротивления не могут быть отрицательными.');
 rt=rjc+rcs+rsa;if(!(rt>0))return err('Суммарное тепловое сопротивление должно быть больше нуля.');}
var R=r25/1000,B=Math.log(k2)/(t2-25),al=100*(Math.exp(B)-1),pc=i*i*R,tl=ta+rt*ps,t0=tl+rt*pc,tj=NaN,run=false,ic=NaN,tb=NaN;
if(B>0){var A=rt*pc*Math.exp(B*(tl-25));tb=tl+1/B;ic=Math.sqrt(1/(Math.E*B*rt*R*Math.exp(B*(tl-25))));
 if(ge(A*B,Math.exp(-1)))run=true;
 else{var lo=0,hi=-Math.log(A*B)/B;for(var k=0;k<200;k++){var m=(lo+hi)/2;if(A*Math.exp(B*m)-m>0)lo=m;else hi=m;}tj=tl+(lo+hi)/2;}}
else tj=t0;
if(![t0,al].every(isFinite)||(!run&&!isFinite(tj)))return err('Значения вне диапазона надёжного расчёта.');
var h=row('Температурный коэффициент Rds(on) по двум точкам α',fmt(al,4)+' %/°C')+
 row('Тепловое сопротивление кристалл–среда Rθ',fmt(rt,4)+' °C/Вт')+
 row('Tj без учёта роста Rds(on) — по сопротивлению при 25 °C',fmt(t0,4)+' °C');
var st;
if(run){h+=row('Устойчивая температура кристалла','нет — потери растут с нагревом быстрее, чем отводится тепло');
 st='Риск теплового разгона: при токе '+sx(i,ic,'А')+' устойчивой температуры кристалла нет — по модели граница '+sx(ic,i,'А');}
else{var rj=R*Math.exp(B*(tj-25)),pj=i*i*rj,pt=pj+ps,g=B*(tj-tl);
 h+=row('Температура кристалла Tj с ростом Rds(on)',(tm===null?fmt(tj,4):fx(tj,tm))+' °C')+
  row('Rds(on) при Tj',fmt(rj*1000,4)+' мОм — '+fmt(rj/R,4)+' от значения при 25 °C')+
  row('Потери проводимости Iд²·Rds(on)(Tj)',si(pj,'Вт'))+
  row('Потери переключения и прочие',ps>0?si(ps,'Вт'):'не заданы')+
  row('Всего в ключе',si(pt,'Вт'));
 if(!ja)h+=row('Температура корпуса / радиатора',fmt(tj-pt*rjc,4)+' / '+fmt(ta+pt*rsa,4)+' °C');
 if(B>0)h+=row('Петлевое усиление G = Rθ·dP/dTj',fmt(g,3)+' — ошибка в Rθ или потерях усиливается в 1/(1 − G) = '+fmt(1/(1-g),3)+' раза');
 var ex=gt(tj,t2);
 if(tm!==null&&gt(tj,tm))st='Расчётная температура кристалла '+fx(tj,tm)+' °C больше Tj max '+fx(tm,tj)+' °C';
 else if(tm===null)st='Недостаточно данных: Tj max из паспорта не задана; оценка Tj ≈ '+fmt(tj,4)+' °C';
 else st=(ex?'Оценка с экстраполяцией: ':'Оценка: ')+'Tj ≈ '+fx(tj,tm)+' °C не больше Tj max '+fx(tm,tj)+' °C'+(ex?' — Tj выше второй точки графика '+fmt(t2)+' °C, Rds(on) продолжено по модели':'');}
if(B>0)h+=row('Граница теплового разгона по модели','ток '+si(ic,'А')+', Tj на границе '+fmt(tb,4)+' °C');
if(tm!==null)h+=row('Tj max',fmt(tm)+' °C');
var n='Rds(on) растёт с температурой по модели Infineon: Rds(on)(Tj) = R25·(1 + α/100)^(Tj − 25), α — по двум точкам графика из паспорта. Между 25 °C и второй точкой это интерполяция по экспоненте, за их пределами — продолжение модели. ';
n+='Потери переключения считаются постоянными, хотя на деле тоже зависят от температуры. Режим установившийся: для импульсной нагрузки нужна переходная тепловая характеристика Zθ из паспорта. Тепловые сопротивления — для ваших условий монтажа и обдува; отвод тепла через выводы и плату параллельно радиатору не учтён. ';
n+='Тепловой разгон здесь — отсутствие устойчивой температуры при заданном токе через полностью открытый ключ; разгон в линейном режиме, когда с нагревом снижается порог, калькулятор не рассматривает.';
out(h+row('Статус',st)+note(n));
}
''',
about="""<div class="formula">Rds(on)(Tj) = R25 · (1 + α/100)<sup>Tj − 25</sup>,&nbsp;&nbsp;(1 + α/100)<sup>T2 − 25</sup> = k2<br>Tj = Ta + Rθ · [Pпер + Iд² · Rds(on)(Tj)],&nbsp;&nbsp;Rθ = Rθjc + Rθcs + Rθsa или Rθja<br>Tj = Ta + Rθ·Pпер + u,&nbsp;&nbsp;u = A · e<sup>B·u</sup>,&nbsp;&nbsp;A = Rθ·Iд²·R25·e<sup>B·(Ta + Rθ·Pпер − 25)</sup>,&nbsp;&nbsp;B = ln(1 + α/100)<br>Устойчивое решение есть при A·B &lt; 1/e;&nbsp;&nbsp;G = Rθ·dP/dTj = B·u &lt; 1<br>Граница разгона: Iкр = √(1 / (e·B·Rθ·R25·e<sup>B·(Ta + Rθ·Pпер − 25)</sup>))</div>
<p><b>Почему простого расчёта мало.</b> Сопротивление открытого MOSFET растёт с температурой, и положительный температурный коэффициент Rds(on) усиливает потери I²·R по мере нагрева (Microsemi, APT-0403). Если взять Rds(on) при 25 °C, потери и температура кристалла получаются заниженными. Калькулятор показывает оба результата: без роста сопротивления и с ним.</p>
<p><b>Модель Rds(on) от температуры.</b> Infineon в руководстве по расчёту потерь MOSFET и в своей базе знаний записывает Rds(on)(Tj) = Rds(on)(25 °C)·(1 + α/100)<sup>Tj − 25</sup>, где α находят по двум точкам графика Rds(on) = f(Tj) из паспорта. Калькулятор берёт эти точки: 25 °C (множитель 1) и вашу вторую температуру с нормированным множителем k2. Между ними модель — интерполяция по экспоненте; выше второй точки — её продолжение, и статус об этом говорит. Rds(on) при 25 °C берите максимальное по паспорту, при вашем напряжении затвора.</p>
<p><b>Тепловая цепь.</b> Тепло идёт от кристалла к воздуху через последовательные тепловые сопротивления: Tj = Ta + P·(Rθjc + Rθcs + Rθsa) (onsemi, AND9016) или Tj = Ta + P·Rθja для ключа без радиатора. Это та же цепочка, что на странице <a href="raschet-radiatora.html">расчёта радиатора</a>, но задача обратная: там мощность задана и подбирается Rθsa радиатора, а здесь радиатор задан, а мощность сама зависит от температуры кристалла.</p>
<p><b>Решение и тепловой разгон.</b> Уравнение Tj = Ta + Rθ·P(Tj) — это пересечение прямой отвода тепла и выпуклой кривой потерь. Пересечений бывает два: нижнее — устойчивая рабочая точка, верхнее — неустойчивое. Если пересечения нет, потери с нагревом растут быстрее, чем отводится тепло: устойчивой температуры нет — это и есть тепловой разгон по модели. После подстановки u = Tj − Ta − Rθ·Pпер уравнение принимает вид u = A·e<sup>B·u</sup>; его решение выражается через функцию Ламберта и существует при A·B ≤ 1/e. Калькулятор находит нижний корень делением отрезка пополам, а при A·B ≥ 1/e выдаёт «Риск теплового разгона». Петлевое усиление G = Rθ·dP/dTj показывает близость к границе: ошибка в тепловом сопротивлении или потерях усиливается в 1/(1 − G) раз. Ток, при котором решение исчезает, — Iкр в рамке; температура на этой границе — Ta + Rθ·Pпер + 1/B, обычно выше Tj max, поэтому раньше срабатывает проверка Tj max.</p>
<p><b>Откуда взять исходные данные.</b> Действующий ток и потери переключения — например, со страницы <a href="poteri-buck-preobrazovatelya.html">потерь buck-преобразователя</a>, строки «для расчёта нагрева». Скорость переключения, от которой зависят эти потери, задаёт <a href="rezistor-zatvora-mosfet.html">цепь затвора</a>. Тепловые сопротивления — из паспортов ключа, прокладки и радиатора для ваших условий; Tj max — из паспорта ключа, можно ввести и свою, меньшую расчётную.</p>
<p><b>Чего калькулятор не учитывает.</b> Потери переключения считаются постоянными, хотя тоже зависят от температуры. Режим установившийся: для коротких импульсов нужна переходная тепловая характеристика Zθ из паспорта. Отвод тепла через выводы и плату параллельно радиатору не учтён. Разгон в линейном режиме, когда с нагревом снижается порог открывания, — другой механизм, здесь он не рассматривается. Изоляцию корпуса от радиатора, пути утечки и зазоры калькулятор не считает.</p>""",
example="""<p>Условный ключ: Rds(on) 20 мОм при 25 °C и 1,9 от него при 150 °C по графику паспорта; действующий ток 8 А, потери переключения 0,5 Вт; Rθjc = 1, прокладка 0,5, радиатор 20 °C/Вт, воздух 40 °C, Tj max 175 °C. По двум точкам α = 0,5148 %/°C. Без учёта роста сопротивления кристалл нагрелся бы до 78,27 °C, с ним — до <b>88,97 °C</b>: Rds(on) 27,78 мОм, потери проводимости 1,778 Вт. Петлевое усиление 0,196 — далеко от разгона; по модели устойчивая температура исчезла бы при токе 12,08 А.</p>
<p>Тот же ключ без радиатора, Rθja = 40 °C/Вт: без учёта роста — 111,2 °C, с ним — <b>165,1 °C</b>, сопротивление выросло в 2,054 раза, петлевое усиление 0,54 — ошибка в Rθja на 10 % даёт ошибку нагрева уже около 22 %. Температура выше второй точки графика, поэтому статус — «Оценка с экстраполяцией». При токе 9 А устойчивой температуры нет: граница по модели — 8,65 А.</p>""",
faqs=[
 ("Почему температура выше, чем при простом расчёте?",
  "Простой расчёт берёт Rds(on) при 25 °C. На деле при нагреве сопротивление растёт, растут потери проводимости и снова температура. Калькулятор находит точку, где эта цепочка устанавливается, — и она выше."),
 ("Что значит «риск теплового разгона»?",
  "При заданном токе и тепловом сопротивлении потери с нагревом растут быстрее, чем радиатор отводит тепло, и устойчивой температуры по модели нет. Нужен больший радиатор, меньший ток или ключ с меньшим Rds(on). Калькулятор показывает и ток, при котором решение исчезает."),
 ("Чем эта страница отличается от расчёта радиатора?",
  "На странице радиатора мощность задана, и подбирается тепловое сопротивление радиатора. Здесь радиатор задан, а мощность зависит от температуры через Rds(on), и рассчитывается сама температура кристалла."),
 ("Где взять нормированный множитель Rds(on)?",
  "В паспорте ключа есть график Rds(on) или нормированного Rds(on) от температуры кристалла. Возьмите отношение значения при высокой температуре, например при 150 °C, к значению при 25 °C. Если в паспорте дан коэффициент α, множитель равен (1 + α/100) в степени (T2 − 25)."),
],
related=["raschet-radiatora", "poteri-buck-preobrazovatelya", "rezistor-zatvora-mosfet", "linear-regulator-loss", "rcd-snabber-flyback"],
review_status="estimate",
sources=[
 dict(INFINEON_LOSSES, sections=["RDSon(Tj) = RDSon,max(25 °C)·(1 + α/100)^(Tj − 25 °C); α — по двум точкам паспорта", "PCM = RDSon·IDrms²"]),
 dict(INFINEON_ALPHA, sections=["RDS(on) = RDS(on)@25 °C·[(1 + α/100)^(Tj − 25 °C)]", "без α в паспорте — по графику RDS(on) = f(Tj) или по двум температурам"]),
 dict(ONSEMI_AND9016, sections=["Heat Sink Basics: Tj − Ta = P·(Rθjc + Rθcs + Rθsa)"]),
 dict(MCHP_APT0403, sections=["положительный температурный коэффициент Rds(on) усиливает потери I²R с ростом температуры"]),
],
assumptions=[
 "Rds(on) растёт по экспоненте Infineon (1 + α/100)^(Tj − 25), α — по двум точкам графика паспорта.",
 "Действующий ток через ключ задан и от температуры не зависит.",
 "Потери переключения и прочие постоянны.",
 "Установившийся режим, последовательная тепловая цепь Rθjc + Rθcs + Rθsa или Rθja.",
],
limitations=[
 "Выше второй точки графика и ниже 25 °C модель Rds(on) продолжается за пределы паспортных данных.",
 "Импульсный режим, переходное тепловое сопротивление Zθ и тепловая ёмкость не учитываются.",
 "Разгон в линейном режиме из-за снижения порога с нагревом не рассматривается.",
 "Изоляцию корпуса от радиатора, пути утечки и зазоры калькулятор не считает.",
],
),

# ─── 4. Резистор затвора и драйвер MOSFET / IGBT ────────────────────────────
# Видно в выдаче (два поиска): Nexperia AN90059 Rev. 1 (2025) — IG,pl =
# (Vdrive − Vpl)/RG(tot), RG(tot) = RG(int) + RG(ext) + Rout(driver); пример
# BUK7S1R0-40H: 10/0 В, 10 Ом, Vpl ≈ 4,2 В → 0,58 и −0,42 А. Статья базы знаний
# Infineon: IGBT IGD08N120S7 + 1EDN751x, Qge + Qgc = 36 нКл, 15 В, Vge* = 9,9 В,
# 100 нс → 0,36 А, Rtot = 14,17 Ом, Rgon = 13,32 Ом, ряд 15 Ом → 112 нс; Rgoff
# тем меньше, чем выше dv/dt и температура. Паспорт 1EDN751x: 0,85 и 0,35 Ом.
# TI SLUA618A (Balogh): P = VDRV·QG·fDRV; заряд идёт через выходное
# сопротивление драйвера, внешний и внутренний резисторы; мощность не зависит
# от скорости (куда уходит большая часть при Rg < 5 Ом — выдача противоречива,
# на странице не приписывается); dv/dt_max =
# VTH/((RLO + RGATE + RG,I)·CGD). Статья Infineon «Effect of dv/dt»:
# VGS = RG·CGD·dv/dt. Wu (IR): амплитуда зависит от dv/dt, Cgd, Cgs и
# сопротивления; замкнутая формула с экспонентой — в пересказе выдачи. TI
# UCC21520 (паспорт и FAQ): Rgs притягивает затвор к истоку при обесточенном
# драйвере и помогает против dv/dt до включения драйвера; числового значения
# в паспорте не найдено — калькулятор значение не советует. Nexperia AN11158 и
# Infineon: порог с нагревом снижается. Деление мощности пропорционально
# сопротивлениям — следствие одного тока в последовательной цепи; поровну
# между фронтами — приближение. Статус estimate.
dict(
slug="rezistor-zatvora-mosfet", cat="elektronika",
name="Резистор затвора и драйвер MOSFET и IGBT",
h2_topic="Резистор затвора и драйвер",
short="Ток затвора на плато, время переключения, мощность драйвера, ложное включение через ёмкость Миллера",
title="Резистор затвора MOSFET и IGBT: ток плато Миллера, мощность драйвера, ложное включение",
desc="Расчёт цепи затвора MOSFET и IGBT: ток затвора на плато Миллера при включении и выключении, длительность плато Qgd/Iз и время переключения, мощность драйвера Qg·ΔV·f и её распределение по сопротивлениям, оценка ложного включения ΔVgs ≈ Crss·dv/dt·R против порога при нагреве, резистор затвор–исток.",
intro='Резистор затвора задаёт, как быстро переключается ключ и насколько он защищён от ложного включения соседним ключом. Калькулятор считает токи затвора на плато Миллера, время переключения, мощность драйвера и наведённое напряжение на затворе закрытого ключа. Потери переключения при этих временах считает страница <a href="poteri-buck-preobrazovatelya.html">потерь buck-преобразователя</a>.',
kw="резистор затвора rg mosfet igbt драйвер затвора плато миллера ток затвора qgd qg мощность драйвера ложное включение dv/dt crss пороговое напряжение резистор затвор исток gate resistor gate driver",
fields=[
 dict(id="von", label="Напряжение драйвера при включении Vвкл", unit="В", val="12"),
 dict(id="voff", label="Напряжение драйвера при выключении Vвыкл", unit="В", val="0", hint="0 В при однополярном питании драйвера; отрицательное — при двуполярном"),
 dict(id="rsrc", label="Выходное сопротивление драйвера на подтяжку к питанию", unit="Ом", val="0,85", hint="По паспорту драйвера. Пример: Infineon 1EDN751x — 0,85 Ом"),
 dict(id="rsnk", label="Выходное сопротивление драйвера на сток к Vвыкл", unit="Ом", val="0,35", hint="По паспорту драйвера. Пример: Infineon 1EDN751x — 0,35 Ом"),
 dict(type="select", id="rgmode", label="Внешний резистор затвора", opts=[
  ("one","Один резистор для включения и выключения"),
  ("two","Раздельные резисторы включения и выключения")], val="one"),
 dict(id="rg", label="Внешний резистор затвора Rg", unit="Ом", val="10"),
 dict(id="rgon", label="Внешний резистор цепи включения Rg,вкл", unit="Ом", val="10"),
 dict(id="rgoff", label="Внешний резистор цепи выключения Rg,выкл", unit="Ом", val="4,7", hint="Падение на диоде цепи выключения калькулятор не учитывает"),
 dict(id="rgi", label="Внутреннее сопротивление затвора ключа Rg,вн", unit="Ом", val="1", hint="По паспорту ключа"),
 dict(id="vpl", label="Напряжение плато Миллера Vпл", unit="В", val="5", hint="По графику заряда затвора из паспорта при вашем токе"),
 dict(id="qgd", label="Заряд плато Qgd (у IGBT — Qgc)", unit="нКл", val="20", hint="По паспорту; с ростом напряжения сток–исток он растёт (Nexperia)"),
 dict(id="qgs2", label="Заряд Qgs2 — от порога до плато", unit="нКл", val="5", hint="Необязательное: для оценки полного времени переключения"),
 dict(id="qg", label="Полный заряд затвора Qg на перепад от Vвыкл до Vвкл", unit="нКл", val="60", hint="По графику заряда затвора из паспорта для вашего перепада напряжения"),
 dict(id="fsw", label="Частота переключения", unit="кГц", val="100"),
 dict(id="crss", label="Ёмкость Миллера Crss (у IGBT — Cres)", unit="пФ", val="10", hint="По паспорту. Crss сильно растёт при малом напряжении сток–исток, а паспорт даёт её при одном напряжении"),
 dict(id="dvdt", label="Скорость нарастания напряжения на закрытом ключе dv/dt", unit="В/нс", val="20", hint="Её задаёт включение соседнего ключа полумоста: по осциллограмме или по расчёту его переключения"),
 dict(id="vth", label="Минимальное пороговое напряжение Vth min при 25 °C", unit="В", val="3", hint="По паспорту — минимальное, а не типовое"),
 dict(id="kth", label="Нормированный порог при наибольшей Tj", unit="о. е.", val="0,8", hint="Отношение порога при наибольшей рабочей температуре к значению при 25 °C — по графику из паспорта. Пустое поле — сравнение только с порогом при 25 °C и «Недостаточно данных»"),
 dict(id="rgs", label="Резистор затвор–исток Rgs", unit="кОм", val="", hint="Необязательное. Удерживает ключ закрытым при обесточенном драйвере (TI); значение — по документации драйвера и ключа"),
],
js=R_JS + r'''
function sync(){var two=S('rgmode')==='two';hideF('rg',two);hideF('rgon',!two);hideF('rgoff',!two);}
function init(){$('rgmode').addEventListener('change',sync);sync();}
function calc(){
var two=S('rgmode')==='two',von=P('von'),voff=P('voff'),rs=P('rsrc'),rk=P('rsnk'),rgi=P('rgi'),vpl=P('vpl'),qgd=P('qgd'),qg=P('qg'),f=P('fsw'),crss=P('crss'),dv=P('dvdt'),vth=P('vth'),qs=OPT('qgs2'),kth=OPT('kth'),rgs=OPT('rgs'),ron,roff;
if([von,voff,rs,rk,rgi,vpl,qgd,qg,f,crss,dv,vth].some(isNaN))return err('Заполните числами напряжения и сопротивления драйвера, внутренний Rg, напряжение плато, Qgd, Qg, частоту, Crss, dv/dt и пороговое напряжение.');
if(two){ron=P('rgon');roff=P('rgoff');if(isNaN(ron)||isNaN(roff))return err('Введите внешние резисторы цепей включения и выключения.');}
else{ron=P('rg');if(isNaN(ron))return err('Введите внешний резистор затвора.');roff=ron;}
if(rs<0||rk<0||rgi<0||ron<0||roff<0)return err('Сопротивления не могут быть отрицательными.');
if(voff>0)return err('Напряжение выключения — 0 В или отрицательное: при положительном уровне затвор не разряжается до нуля.');
if(!(vth>0))return err('Пороговое напряжение должно быть больше нуля.');
if(!(vpl>vth))return err('Напряжение плато должно быть выше порогового напряжения — проверьте данные паспорта.');
if(!(von>vpl))return err('Напряжение включения драйвера должно быть выше напряжения плато, иначе ключ не откроется полностью.');
if(qgd<=0||qg<=0||f<=0||crss<=0||dv<=0)return err('Qgd, Qg, частота, Crss и dv/dt должны быть больше нуля.');
if(qs!==null){if(isNaN(qs))return err('Qgs2 — число в нанокулонах. Если его нет, оставьте поле пустым.');if(qs<0)return err('Qgs2 не может быть отрицательным.');}
if(!(qg>qgd+(qs===null?0:qs)))return err('Полный заряд затвора Qg должен быть больше Qgd'+(qs===null?'':' + Qgs2')+' — проверьте данные паспорта.');
if(kth!==null){if(isNaN(kth))return err('Нормированный порог — число. Если графика нет, оставьте поле пустым.');if(kth<=0||kth>1)return err('Нормированный порог при нагреве — больше 0 и не больше 1: у MOSFET и IGBT порог с ростом температуры снижается.');}
if(rgs!==null){if(isNaN(rgs))return err('Резистор затвор–исток — число в килоомах. Если его нет, оставьте поле пустым.');if(rgs<=0)return err('Резистор затвор–исток должен быть больше нуля.');}
var Ron=rs+ron+rgi,Roff=rk+roff+rgi;
if(!(Ron>0&&Roff>0))return err('Суммарное сопротивление цепи затвора должно быть больше нуля.');
var Q=qgd*1e-9,QG=qg*1e-9,F=f*1e3,C=crss*1e-12,DV=dv*1e9,sw=von-voff;
var ion=(von-vpl)/Ron,ioff=(vpl-voff)/Roff,pd=QG*sw*F,ph=pd/2;
var RG=rgs===null?null:rgs*1e3,rd=rk+roff,rp=RG===null?rd:rd*RG/(rd+RG),re=rgi+rp,vg=C*DV*re,vt=kth===null?vth:vth*kth,mg=vt-voff;
var ml=voff<0?'запаса до порога Vth − Vвыкл ':'порога ';
var h=row('Сопротивление цепи затвора: включение / выключение',fmt(Ron,4)+' / '+fmt(Roff,4)+' Ом')+
 row('Ток затвора в начале фронта: включение / выключение',si(sw/Ron,'А')+' / '+si(sw/Roff,'А'))+
 row('Ток затвора на плато Миллера: включение / выключение',si(ion,'А')+' / '+si(ioff,'А'))+
 row('Длительность плато Qgd / Iз: включение / выключение',si(Q/ion,'с')+' / '+si(Q/ioff,'с'));
if(qs!==null)h+=row('Время переключения (Qgs2 + Qgd) / Iз: включение / выключение',si((qs*1e-9+Q)/ion,'с')+' / '+si((qs*1e-9+Q)/ioff,'с'));
h+=row('Мощность драйвера Qg·(Vвкл − Vвыкл)·fsw',si(pd,'Вт')+', средний ток от источника Qg·fsw — '+si(QG*F,'А'))+
 row('Из неё: в драйвере / во внешних резисторах / во внутреннем Rg ключа',si(ph*(rs/Ron+rk/Roff),'Вт')+' / '+si(ph*(ron/Ron+roff/Roff),'Вт')+' / '+si(ph*rgi*(1/Ron+1/Roff),'Вт'));
if(RG!==null){var vgo=von*RG/(RG+rs+ron);
 h+=row('Напряжение на затворе открытого ключа с Rgs',fmt(vgo,4)+' В из '+fmt(von)+' В')+
  row('Ток и мощность Rgs при открытом ключе',si(vgo/RG,'А')+', '+si(vgo*vgo/RG,'Вт'));
 if(voff<0){var vgf=voff*RG/(RG+rd);h+=row('Напряжение на затворе закрытого ключа с Rgs',fmt(vgf,4)+' В из '+fmt(voff)+' В');}}
h+=row('Наведённое напряжение ΔVgs ≈ Crss·dv/dt·Rэкв',fx(vg,mg)+' В при Rэкв = '+fmt(re,4)+' Ом')+
 row(kth===null?'Порог для сравнения — Vth min при 25 °C':'Порог для сравнения — Vth min при наибольшей Tj',fmt(vt,4)+' В'+(voff<0?'; запас до порога со смещением '+fmt(voff)+' В — '+fmt(mg,4)+' В':''));
if(kth!==null){var rx=mg/(C*DV)-rgi,xm;
 h+=row('Наибольшая dv/dt без ложного включения',fmt(mg/(C*re)/1e9,4)+' В/нс');
 if(!(rx>0))xm='нет: даже без внешнего резистора наведённое напряжение не ниже порога';
 else if(RG!==null&&!(rx<RG))xm='не ограничен этим условием';
 else{var x=(RG===null?rx:rx*RG/(RG-rx))-rk;xm=x>0?fmt(x,4)+' Ом':'нет: даже без внешнего резистора наведённое напряжение не ниже порога';}
 h+=row('Наибольший внешний резистор цепи выключения по условию ложного включения',xm);}
var st;
if(ge(vg,mg))st='Риск ложного включения: наведённое напряжение ΔVgs ≈ '+fx(vg,mg)+' В не ниже '+ml+(kth===null?'при 25 °C ':'при нагреве ')+fx(mg,vg)+' В';
else if(kth===null)st='Недостаточно данных: порог при рабочей температуре не задан; при 25 °C наведённое напряжение ΔVgs ≈ '+fx(vg,mg)+' В ниже '+ml+fx(mg,vg)+' В, но с нагревом порог снижается';
else st='Оценка: наведённое напряжение ΔVgs ≈ '+fx(vg,mg)+' В ниже '+ml+'при нагреве '+fx(mg,vg)+' В';
var n='Ток затвора на плато — (Vвкл − Vпл)/Rвкл и (Vпл − Vвыкл)/Rвыкл (Nexperia), длительность плато — Qgd / Iз (TI). Мощность Qg·ΔV·fsw (TI SLUA618) рассеивается в сопротивлениях цепи затвора: внутри фронта ток в них один, поэтому мощность делится пропорционально сопротивлениям, а поровну между включением и выключением — приближение. ';
n+='ΔVgs ≈ Crss·dv/dt·R (TI SLUA618, Infineon) — оценка сверху: часть тока Миллера уходит в ёмкость затвор–исток (Wu), и реальный выброс меньше; зато при малом напряжении сток–исток Crss больше паспортной. Порог с нагревом снижается (Nexperia, Infineon), поэтому сравнивать нужно с минимальным порогом при наибольшей Tj. ';
if(RG!==null)n+='Резистор Rgs учтён параллельно цепи выключения драйвера. ';
n+='Изоляцию драйвера, пути утечки и зазоры калькулятор не считает: в сетевом преобразователе драйвер верхнего ключа и его питание находятся под напряжением силовой цепи.';
out(h+row('Статус',st)+note(n));
}
''',
about="""<div class="formula">Rвкл = Rдр↑ + Rg,вкл + Rg,вн,&nbsp;&nbsp;Rвыкл = Rдр↓ + Rg,выкл + Rg,вн<br>Iз,вкл = (Vвкл − Vпл) / Rвкл,&nbsp;&nbsp;Iз,выкл = (Vпл − Vвыкл) / Rвыкл,&nbsp;&nbsp;в начале фронта (Vвкл − Vвыкл) / R<br>tпл = Qgd / Iз,&nbsp;&nbsp;tпер ≈ (Qgs2 + Qgd) / Iз<br>Pдр = Qg·(Vвкл − Vвыкл)·fsw;&nbsp;&nbsp;на каждом фронте ≈ Pдр/2, делится пропорционально сопротивлениям<br>ΔVgs ≈ Crss·(dv/dt)·Rэкв,&nbsp;&nbsp;Rэкв = Rg,вн + (Rдр↓ + Rg,выкл) ∥ Rgs;&nbsp;&nbsp;риск, если ΔVgs ≥ Vth,min(Tj) − Vвыкл</div>
<p><b>Ток затвора на плато Миллера.</b> Пока на затворе плато, напряжение на нём почти постоянно, и ток задаёт разность напряжения драйвера и плато на сопротивлении цепи: Iз = (Vвкл − Vпл) / Rз — так в руководстве Nexperia AN90059, где Rз — сумма внутреннего сопротивления затвора ключа, внешнего резистора и выходного сопротивления драйвера. При выключении ток задаёт само напряжение плато — до нуля или до отрицательного уровня драйвера. Пример Nexperia: BUK7S1R0-40H, драйвер 10 и 0 В, 10 Ом, плато около 4,2 В — 0,58 А при включении и 0,42 А при выключении. В начале фронта, пока затвор ещё на уровне выключения, ток больше: (Vвкл − Vвыкл) / R.</p>
<p><b>Время переключения.</b> На плато заряжается ёмкость затвор–сток и меняется напряжение на ключе; длительность плато — Qgd / Iз (TI SLVAEQ9: t = Qgd / Ig). Если задан Qgs2 — заряд от порога до плато, за который нарастает ток, — время переключения ≈ (Qgs2 + Qgd) / Iз. Пример из базы знаний Infineon: IGBT IGD08N120S7 с драйвером 1EDN751x, Qge + Qgc = 36 нКл, драйвер 15 В, плато 9,9 В, выходное сопротивление драйвера 0,85 Ом. Для 100 нс нужен ток 0,36 А и полное сопротивление 14,17 Ом, внешний резистор — 13,32 Ом; с ближайшим большим 15 Ом время — 112 нс. Калькулятор этот пример воспроизводит. Скорость нарастания напряжения при этом ≈ ΔV / tпл — её и «видит» соседний ключ полумоста.</p>
<p><b>Мощность драйвера.</b> За период драйвер заряжает и разряжает затвор, и мощность Qg·Vдр·f не зависит от того, как быстро это происходит (TI SLUA618, Balogh). Она рассеивается в выходном сопротивлении драйвера, внешнем резисторе и внутреннем сопротивлении затвора ключа; чем меньше внешний резистор, тем большая доля приходится на сам драйвер. На каждом фронте ток во всех последовательных сопротивлениях один и тот же, поэтому мощность делится между ними пропорционально сопротивлениям; деление поровну между включением и выключением — приближение, точное для линейной ёмкости. При двуполярном питании перепад — Vвкл − Vвыкл, а Qg берут по графику заряда затвора для этого перепада.</p>
<p><b>Ложное включение через ёмкость Миллера.</b> Когда включается соседний ключ полумоста, напряжение на закрытом ключе быстро нарастает, и ток Crss·dv/dt через ёмкость Миллера течёт через сопротивления цепи затвора на исток. Если падение на них достигает порога, ключ приоткрывается, и через полумост идёт сквозной ток. TI (SLUA618) задаёт допустимую скорость dv/dt = Vth / (R·Cgd) с порогом при наибольшей температуре; база знаний Infineon — Vgs = Rg·Cgd·dv/dt. Wu (International Rectifier) уточняет: часть тока уходит в ёмкость затвор–исток, поэтому реальный выброс меньше этой оценки. С другой стороны, Crss при малом напряжении сток–исток намного больше паспортной, а порог с нагревом снижается (Nexperia AN11158, Infineon). Поэтому калькулятор сравнивает оценку с минимальным порогом при наибольшей температуре кристалла, а без него выдаёт «Недостаточно данных». Infineon: чем выше dv/dt и температура, тем меньше должен быть резистор цепи выключения. Отрицательное напряжение выключения добавляет запас — оно входит в сравнение.</p>
<p><b>Резистор затвор–исток.</b> TI в паспорте и FAQ драйвера UCC21520 рекомендует резистор между затвором и истоком, чтобы притянуть затвор к истоку, когда выход драйвера обесточен и не определён; он также помогает против ложного включения через ёмкость Миллера, пока драйвер ещё не включился. Числового значения в паспорте TI мы не нашли, поэтому калькулятор номинал не советует, а показывает цену выбранного: делитель с сопротивлением драйвера снижает напряжение на затворе открытого ключа, а сам резистор нагружает драйвер током и мощностью. Не оставляйте затвор без цепи к истоку: без неё он заряжается утечками и наводками.</p>
<p><b>Изоляция.</b> Изоляцию драйвера, пути утечки и зазоры калькулятор не считает. В сетевом преобразователе драйвер верхнего ключа и его питание находятся под напряжением силовой цепи — требования к изоляции берут из паспорта драйвера и норм на изделие.</p>
<p><b>Связь с другими страницами.</b> Сопротивления цепи затвора и время фронтов переносят на страницу <a href="poteri-buck-preobrazovatelya.html">потерь buck-преобразователя</a>, а получившиеся потери ключа — на страницу <a href="nagrev-mosfet.html">нагрева MOSFET</a>. Резистор в цепи базы биполярного транзистора считает <a href="bazovyy-rezistor-tranzistora.html">другой калькулятор</a>: там ток базы нужен постоянно, а затвору — только на время перезаряда.</p>""",
example="""<p>Драйвер Infineon 1EDN751x (0,85 Ом к плюсу, 0,35 Ом к минусу питания) на 12 В управляет условным ключом: внутренний Rg 1 Ом, плато 5 В, Qgd 20 нКл, Qgs2 5 нКл, Qg 60 нКл, Crss 10 пФ, Vth min 3 В и 0,8 от него при нагреве; внешний резистор 10 Ом. Ток на плато (12 − 5)/11,85 = 0,5907 А при включении и 5/11,35 = 0,4405 А при выключении, плато длится 33,86 и 45,4 нс. При 100 кГц драйвер отдаёт 60 нКл · 12 В · 100 кГц = 72 мВт: 62,1 мВт — во внешних резисторах, 3,692 мВт — в драйвере, 6,21 мВт — внутри ключа. Соседний ключ включается со скоростью 20 В/нс: ΔVgs ≈ 10 пФ · 20 В/нс · 11,35 Ом = 2,27 В — ниже порога при нагреве 2,4 В, но запас мал: при 26 В/нс уже «Риск ложного включения». Допустимая скорость — 21,15 В/нс, наибольший внешний резистор выключения — 10,65 Ом.</p>
<p>Пример Nexperia: драйвер 10 и 0 В, суммарное сопротивление 10 Ом, плато 4,2 В — 0,58 А при включении и 0,42 А при выключении. Пример Infineon: IGBT с зарядом 36 нКл до конца плато, драйвер 15 В, плато 9,9 В, выходное сопротивление драйвера 0,85 Ом — с резистором 13,32 Ом плато длится 100 нс, с 15 Ом — 111,9 нс; в статье Infineon — 112 нс.</p>""",
faqs=[
 ("Как выбрать внешний резистор затвора?",
  "Меньший резистор ускоряет переключение и снижает потери переключения, но увеличивает dv/dt, звон и помехи; больший — наоборот. Для цепи выключения есть верхний предел: наведённое через ёмкость Миллера напряжение должно оставаться ниже порога при нагреве — калькулятор его считает. Часто ставят раздельные резисторы включения и выключения."),
 ("Зачем отрицательное напряжение выключения?",
  "Оно добавляет запас против ложного включения: затвор сидит ниже нуля, и наведённому напряжению нужно дойти до порога от отрицательного уровня. Зато растёт перепад, а с ним мощность драйвера Qg·(Vвкл − Vвыкл)·f."),
 ("Нужен ли резистор между затвором и истоком?",
  "TI рекомендует его, чтобы затвор не оставался без цепи к истоку, когда драйвер обесточен. Номинал берут по документации драйвера и ключа; калькулятор показывает, как выбранный резистор снижает напряжение на затворе и нагружает драйвер."),
 ("Почему в паспорте драйвера ток больше рассчитанного?",
  "Паспорт даёт пиковый ток при определённых условиях — по сути в начале фронта. На плато Миллера напряжение на затворе уже поднялось, и ток меньше: (Vвкл − Vпл) / R. Время переключения задаёт именно ток на плато."),
],
related=["poteri-buck-preobrazovatelya", "nagrev-mosfet", "bazovyy-rezistor-tranzistora", "rcd-snabber-flyback", "snabber-rc"],
review_status="estimate",
sources=[
 dict(NEXPERIA_AN90059, sections=["IG,pl = (Vdrive − Vpl)/RG(tot); RG(tot) = RG(int) + RG(ext) + Rout(driver)", "пример BUK7S1R0-40H: 10/0 В, 10 Ом, Vpl ≈ 4,2 В — 0,58 и −0,42 А", "с ростом VDS растёт QGD"]),
 dict(INFINEON_RG, sections=["пример IGD08N120S7 и 1EDN751x: Qge + Qgc = 36 нКл, 15 В, Vge* = 9,9 В, 100 нс — 0,36 А, 14,17 Ом, Rgon = 13,32 Ом; 15 Ом — 112 нс", "Rgoff тем меньше, чем выше dv/dt и температура"]),
 dict(INFINEON_1EDN, sections=["выходное сопротивление 0,85 Ом к плюсу и 0,35 Ом к минусу питания"]),
 dict(TI_SLVAEQ9, sections=["t = QGS2/IG и QGD/IG"]),
 dict(TI_SLUA618, sections=["PGATE = VDRV·QG·fDRV; заряд идёт через выходное сопротивление драйвера, внешний и внутренний резисторы", "мощность не зависит от скорости заряда", "dv/dt_max = VTH / ((RLO + RGATE + RG,I)·CGD)"]),
 dict(INFINEON_DVDT, sections=["VGS = RG·CGD·dv/dt; dv/dt = Vth / (Rg·Cgd)"]),
 dict(IR_WU, sections=["наведённое напряжение зависит от dv/dt, Cgd, Cgs и полного сопротивления затвора; часть тока уходит в Cgs"]),
 dict(NEXPERIA_AN11158, sections=["пороговое напряжение VGS(th) с ростом температуры снижается"]),
 dict(TI_UCC21520, sections=["резистор затвор–исток притягивает затвор к истоку при обесточенном драйвере", "помогает против ложного включения через ёмкость Миллера до включения драйвера"]),
],
assumptions=[
 "На плато Миллера напряжение затвора постоянно и равно Vпл; ток за интервал Qgs2 принят равным току на плато.",
 "Мощность драйвера делится поровну между фронтами, внутри фронта — пропорционально сопротивлениям.",
 "Ток Миллера при ложном включении — Crss·dv/dt целиком через сопротивления цепи затвора (оценка сверху).",
 "Падение на диоде цепи выключения и индуктивность цепи затвора не учитываются.",
],
limitations=[
 "Crss, Qgd и плато зависят от напряжения и тока; паспортные значения даны для своих условий.",
 "Звон в цепи затвора, индуктивность общего истока и активный Miller clamp драйвера не моделируются.",
 "Номинал резистора затвор–исток калькулятор не советует: его выбирают по документации драйвера и ключа.",
 "Изоляцию драйвера, пути утечки и зазоры калькулятор не считает.",
],
),

]
