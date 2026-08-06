# -*- coding: utf-8 -*-
"""Генератор статического сайта «ВольтКальк». Каждая страница самодостаточна
(стили и скрипт внутри файла) — можно открыть двойным кликом без сервера."""

import os, html

SITE_NAME = "ВольтКальк"
TAGLINE = "Онлайн-калькуляторы для электрика и радиолюбителя"
BASE_URL = "https://macos2024.github.io"

# Файл подтверждения прав в Яндекс.Вебмастере. Отдаётся в корне сайта и не
# должен пропадать при пересборке — иначе верификация домена слетает.
YANDEX_VERIFICATION = "yandex_eb993645a776a164.html"
YANDEX_VERIFICATION_HTML = """<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    </head>
    <body>Verification: eb993645a776a164</body>
</html>"""

CATS = [
    ("osnovy", "Основы электротехники"),
    ("provodka", "Проводка и защита"),
    ("pitanie", "Питание и энергия"),
    ("elektronika", "Электроника"),
]

METRIKA = """<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=111301996', 'ym');
    ym(111301996, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/111301996" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->"""

CSS = """
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:#f4f5f2;color:#1c2422;line-height:1.55;font-size:16px}
a{color:#0d5c50}
.top{background:#0f2e2a;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.brand{color:#fff;text-decoration:none;font-weight:700;font-size:18px;letter-spacing:.2px}
.brand em{color:#f5b942;font-style:normal}
.top a.all{color:#cfe3df;text-decoration:none;font-size:14px}
main{max-width:780px;margin:0 auto;padding:16px}
.crumbs{font-size:13px;color:#5c6660;margin:4px 0 10px}
.crumbs a{color:#5c6660}
h1{font-size:25px;line-height:1.25;margin:6px 0 8px}
.intro{color:#3d4642;margin:0 0 14px}
.card{background:#fff;border:1px solid #e2e6e0;border-radius:14px;padding:18px;box-shadow:0 1px 2px rgba(15,46,42,.05)}
.f{margin:0 0 12px}
.f label{display:block;font-size:14px;font-weight:600;margin-bottom:4px}
.fw{display:flex;gap:8px;align-items:center}
input[type=text]{flex:1;min-width:0;padding:10px 12px;font-size:17px;border:1px solid #cdd4cf;border-radius:9px;background:#fbfcfa;color:#1c2422}
input[type=text]:focus{outline:2px solid #0d5c50;border-color:#0d5c50}
select{padding:10px;font-size:15px;border:1px solid #cdd4cf;border-radius:9px;background:#fbfcfa;max-width:100%;color:#1c2422}
.u{font-size:15px;color:#5c6660;min-width:34px}
.hint{font-size:13px;color:#6b746e;margin-top:3px}
.btn{display:block;width:100%;margin-top:6px;padding:13px;font-size:17px;font-weight:700;color:#102a26;background:#f5b942;border:none;border-radius:10px;cursor:pointer}
.btn:hover{background:#f0ad24}
.btn:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #0d5c50;outline-offset:2px}
.btn2{margin-top:2px;margin-bottom:10px;padding:8px 12px;font-size:14px;background:#eef1ec;border:1px solid #cdd4cf;border-radius:8px;cursor:pointer}
.result{display:none;margin-top:14px;border-top:1px dashed #d8ded8;padding-top:12px}
.result.on{display:block}
.rr{display:flex;justify-content:space-between;gap:12px;padding:7px 10px;background:#fdf6e7;border-left:4px solid #f5b942;border-radius:6px;margin-bottom:6px;flex-wrap:wrap}
.rr b{font-family:Consolas,Menlo,monospace;font-size:17px;font-weight:700}
.rnote{font-size:14px;color:#4b5450;background:#eef4f0;border-radius:6px;padding:8px 10px;margin-top:6px}
.rerr{background:#fdeaea;border-left:4px solid #d4544a;padding:9px 11px;border-radius:6px;font-size:15px}
.article{margin-top:26px}
.article h2{font-size:20px;margin:22px 0 8px}
.article p{margin:8px 0}
.article ul{margin:8px 0;padding-left:22px}
.formula{background:#fff;border:1px solid #e2e6e0;border-radius:9px;padding:10px 14px;font-family:Consolas,Menlo,monospace;font-size:16px;overflow-x:auto;margin:10px 0}
table.t{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0;background:#fff}
table.t th,table.t td{border:1px solid #dde2dc;padding:6px 8px;text-align:center}
table.t th{background:#eef1ec}
.faq h3{font-size:16px;margin:14px 0 4px}
.related ul{padding-left:20px}
footer{margin:34px auto 0;max-width:780px;padding:18px 16px 26px;font-size:13px;color:#6b746e;border-top:1px solid #e2e6e0}
.hero{padding:22px 0 6px}
.hero h1{font-size:27px}
.hero p{color:#3d4642}
.search{width:100%;padding:12px 14px;font-size:17px;border:1px solid #cdd4cf;border-radius:10px;margin:10px 0 4px;background:#fff}
.cat{font-size:20px;margin:26px 0 10px;border-left:4px solid #f5b942;padding-left:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.ccard{display:block;background:#fff;border:1px solid #e2e6e0;border-radius:12px;padding:12px 14px;text-decoration:none;color:#1c2422}
.ccard:hover{border-color:#0d5c50}
.ccard b{display:block;color:#0d5c50;margin-bottom:3px;font-size:15px}
.ccard span{font-size:13px;color:#5c6660}
@media(max-width:520px){h1{font-size:21px}.hero h1{font-size:22px}.rr{flex-direction:column;gap:2px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
.pdfbtn{display:none;width:100%;margin-top:10px;padding:11px;font-size:15px;font-weight:600;color:#0f2e2a;background:#eef4f0;border:1px solid #b9cdc5;border-radius:9px;cursor:pointer}
.pdfbtn:hover{background:#e2ece7}
.pdfbtn.on{display:block}
#printhead{display:none}
#printfoot{display:none}
@media print{
 @page{margin:16mm 14mm}
 body{background:#fff;font-size:12pt}
 .top,footer,.crumbs,.article,.related,.pdfbtn,.btn,.btn2,.hint,#go{display:none!important}
 main{max-width:none;padding:0;margin:0}
 h1{font-size:16pt;margin:0 0 4px}
 .intro{display:none}
 .card{border:none;box-shadow:none;padding:0;background:#fff}
 #printhead{display:block;border-bottom:2px solid #0f2e2a;padding-bottom:6px;margin-bottom:10px}
 #printhead .pt{font-weight:700;font-size:13pt;color:#0f2e2a}
 #printhead .pd{font-size:10pt;color:#555}
 .f{display:none!important}
 #pvals{font-size:11pt}
 #pvals div{padding:2.5px 0;border-bottom:1px dotted #bbb;page-break-inside:avoid}
 #pvals b{font-weight:700}
 .result{display:block!important;border-top:2px solid #0f2e2a;margin-top:10px;padding-top:8px}
 .rr{background:#f2f2f2;border-left:3px solid #444;page-break-inside:avoid}
 .rnote{font-size:10pt;background:#f7f7f7}
 #printfoot{display:block!important;margin-top:14px;padding-top:6px;border-top:1px solid #bbb;font-size:9pt;color:#555}
}
"""

# Общие JS-хелперы: P() понимает запятую как разделитель и селект единиц id+'_unit'
HELPERS_JS = r"""
var $=function(id){return document.getElementById(id)};
function N(value){var v=String(value).trim().replace(',','.').replace(/\s+/g,'');
if(v===''||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(v))return NaN;
var n=Number(v);return isFinite(n)?n:NaN;}
function P(id){var el=$(id);if(!el)return NaN;var n=N(el.value);if(isNaN(n))return NaN;
var u=$(id+'_unit');return u?n*N(u.value):n;}
function S(id){var el=$(id);return el?el.value:'';}
function fmt(x,d){d=d||4;if(!isFinite(x))return '—';if(x===0)return '0';
var s=Number(x.toPrecision(d));var a=Math.abs(s);var t;
if(a>=1e7||a<1e-4){t=s.toExponential(2).replace('e+','·10^').replace('e','·10^');}else{t=String(s);}
return t.replace('.',',');}
function si(x,unit){if(!isFinite(x))return '—';if(x===0)return '0 '+unit;
var Pr=[[1e9,'Г'],[1e6,'М'],[1e3,'к'],[1,''],[1e-3,'м'],[1e-6,'мк'],[1e-9,'н'],[1e-12,'п']];
for(var i=0;i<Pr.length;i++){if(Math.abs(x)>=Pr[i][0])return fmt(x/Pr[i][0])+' '+Pr[i][1]+unit;}
return fmt(x/1e-12)+' п'+unit;}
function tf(x){if(!isFinite(x))return '—';if(x>=3600)return fmt(x/3600,3)+' ч';if(x>=60)return fmt(x/60,3)+' мин';return si(x,'с');}
function row(l,v){return '<div class="rr"><span>'+l+'</span><b>'+v+'</b></div>';}
function note(t){return '<div class="rnote">'+t+'</div>';}
function out(h){var r=$('res');r.innerHTML=h;r.classList.add('on');var b=$('pdf');if(b)b.classList.add('on');}
function err(m){var r=$('res');r.innerHTML='<div class="rerr">'+m+'</div>';r.classList.add('on');var b=$('pdf');if(b)b.classList.remove('on');}
function buildPrint(){
var d=new Date();
var dd=('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2)+'.'+d.getFullYear();
var pd=$('pdate');if(pd)pd.textContent='Дата расчёта: '+dd;
var box=$('pvals');if(!box)return;
var h='',fs=document.querySelectorAll('.f');
for(var i=0;i<fs.length;i++){
 if(fs[i].style.display==='none')continue;
 var lab=fs[i].querySelector('label');
 var inp=fs[i].querySelector('input[type=text]');
 var sel=fs[i].querySelector('select');
 if(!lab)continue;
 var name=lab.textContent.replace(/\s+/g,' ').trim();
 var val='',un='';
 if(inp){
  if(String(inp.value).trim()==='')continue;
  val=String(inp.value).trim();
  var us=fs[i].querySelector('select.u');
  if(us)un=' '+us.options[us.selectedIndex].text;
  else{var sp=fs[i].querySelector('span.u');if(sp)un=' '+sp.textContent;}
 }else if(sel){val=sel.options[sel.selectedIndex].text;}
 else continue;
 h+='<div>'+name+': <b>'+val+un+'</b></div>';
}
var extra=document.querySelectorAll('.rv');
for(var k=0;k<extra.length;k++){
 var v=String(extra[k].value).trim();
 if(v!=='')h+='<div>R'+(k+1)+': <b>'+v+'</b></div>';
}
box.innerHTML=h;
}
function hideF(id,hide){var f=$('f_'+id);if(f)f.style.display=hide?'none':'';}
document.addEventListener('DOMContentLoaded',function(){
var b=$('go');if(b)b.addEventListener('click',function(){calc()});
var pb=$('pdf');if(pb)pb.addEventListener('click',function(){buildPrint();window.print();});
var inp=document.querySelectorAll('input');
for(var i=0;i<inp.length;i++){inp[i].addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();calc();}});}
if(typeof init==='function')init();
});
"""

PAGE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>@TITLE@</title>
<meta name="description" content="@DESC@">
@METRIKA@
<style>@CSS@</style>
</head>
<body>
<header class="top"><a class="brand" href="index.html">⚡ Вольт<em>Кальк</em></a><a class="all" href="index.html">Все калькуляторы</a></header>
<main>
<nav class="crumbs"><a href="index.html">Главная</a> › @CAT@</nav>
<h1>@NAME@</h1>
<p class="intro">@INTRO@</p>
<section class="card">
<div id="printhead"><div class="pt">⚡ ВольтКальк — @NAME@</div><div class="pd" id="pdate"></div></div>
<div id="pvals"></div>
@FIELDS@
<button id="go" class="btn" type="button">Рассчитать</button>
<div id="res" class="result" aria-live="polite"></div>
<button id="pdf" class="pdfbtn" type="button">📄 Сохранить расчёт в PDF</button>
<div id="printfoot">Расчёт выполнен на ВольтКальк (https://macos2024.github.io). Носит справочный характер и не заменяет проект и нормативные документы (ПУЭ, ГОСТ).</div>
</section>
<!-- РСЯ БЛОК 1: сюда будет вставлен код рекламы на Этапе 4 -->
<section class="article">
<h2>Как считается</h2>
@ABOUT@
<h2>Пример расчёта</h2>
@EXAMPLE@
<div class="faq"><h2>Частые вопросы</h2>
@FAQS@
</div>
</section>
<!-- РСЯ БЛОК 2: сюда будет вставлен код рекламы на Этапе 4 -->
<section class="related"><h2>Смотрите также</h2><ul>@RELATED@</ul></section>
</main>
<footer>© @SITE@ — @TAG@.<br>Расчёты носят справочный характер и не заменяют проект и нормативные документы (ПУЭ, ГОСТ). Для ответственных решений консультируйтесь со специалистом. Работы в электроустановках выполняйте при снятом напряжении.</footer>
<script>
@HELPERS@
@JS@
</script>
</body>
</html>
"""

def esc(s):
    return html.escape(s, quote=True)

def field_html(f):
    t = f.get("type", "num")
    fid = f["id"]
    hint = ('<div class="hint">%s</div>' % f["hint"]) if f.get("hint") else ""
    if t == "select":
        opts = "".join('<option value="%s"%s>%s</option>' % (
            esc(str(v)), ' selected' if str(v) == str(f.get("val", "")) else "", esc(lbl))
            for v, lbl in f["opts"])
        return ('<div class="f" id="f_%s"><label for="%s">%s</label>'
                '<div class="fw"><select id="%s">%s</select></div>%s</div>'
                % (fid, fid, esc(f["label"]), fid, opts, hint))
    # числовое поле
    unit_html = ""
    if f.get("units"):
        ui = f.get("ui", 0)
        o = "".join('<option value="%s"%s>%s</option>' % (
            repr(m) if isinstance(m, float) else str(m),
            ' selected' if k == ui else "", esc(lbl))
            for k, (lbl, m) in enumerate(f["units"]))
        unit_html = '<select id="%s_unit" class="u" aria-label="Единицы">%s</select>' % (fid, o)
    elif f.get("unit"):
        unit_html = '<span class="u">%s</span>' % esc(f["unit"])
    val = esc(str(f.get("val", "")))
    ph = esc(str(f.get("ph", "")))
    return ('<div class="f" id="f_%s"><label for="%s">%s</label>'
            '<div class="fw"><input id="%s" type="text" inputmode="decimal" autocomplete="off" value="%s" placeholder="%s">%s</div>%s</div>'
            % (fid, fid, esc(f["label"]), fid, val, ph, unit_html, hint))

def page_html(c, all_by_slug):
    fields = "".join(field_html(f) for f in c.get("fields", []))
    fields += c.get("extra", "")
    faqs = "".join("<h3>%s</h3><p>%s</p>" % (q, a) for q, a in c.get("faqs", []))
    rel = "".join('<li><a href="%s.html">%s</a></li>' % (s, all_by_slug[s]["name"])
                  for s in c.get("related", []) if s in all_by_slug)
    cat_name = dict(CATS)[c["cat"]]
    h = (PAGE.replace("@TITLE@", esc(c["title"]))
             .replace("@DESC@", esc(c["desc"]))
             .replace("@METRIKA@", METRIKA)
             .replace("@CSS@", CSS)
             .replace("@CAT@", cat_name)
             .replace("@NAME@", c["name"])
             .replace("@INTRO@", c["intro"])
             .replace("@FIELDS@", fields)
             .replace("@ABOUT@", c["about"])
             .replace("@EXAMPLE@", c["example"])
             .replace("@FAQS@", faqs)
             .replace("@RELATED@", rel)
             .replace("@HELPERS@", HELPERS_JS)
             .replace("@JS@", c["js"])
             .replace("@SITE@", SITE_NAME)
             .replace("@TAG@", TAGLINE))
    return h

INDEX = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>@T@</title>
<meta name="description" content="@D@">
@METRIKA@
<style>@CSS@</style>
</head>
<body>
<header class="top"><a class="brand" href="index.html">⚡ Вольт<em>Кальк</em></a></header>
<main>
<div class="hero">
<h1>Инженерные калькуляторы по электрике</h1>
<p>Бесплатные расчёты для электриков, радиолюбителей и домашних мастеров: сечение кабеля, автоматы, резисторы, конденсаторы, трансформаторы. Формулы и примеры — под каждым калькулятором.</p>
<input class="search" id="q" type="text" placeholder="Поиск: например, «сечение», «светодиод», «УЗО»…" aria-label="Поиск по калькуляторам">
</div>
@SECTIONS@
</main>
<footer>© @SITE@ — @TAG@.<br>Расчёты носят справочный характер и не заменяют проект и нормативные документы (ПУЭ, ГОСТ). Для ответственных решений консультируйтесь со специалистом.</footer>
<script>
var q=document.getElementById('q');
q.addEventListener('input',function(){
var v=q.value.trim().toLowerCase();
var cards=document.querySelectorAll('.ccard');
for(var i=0;i<cards.length;i++){
var k=cards[i].getAttribute('data-k');
cards[i].style.display=(v===''||k.indexOf(v)>=0)?'':'none';}
var secs=document.querySelectorAll('.catsec');
for(var j=0;j<secs.length;j++){
var vis=secs[j].querySelectorAll('.ccard:not([style*="none"])').length;
secs[j].style.display=vis?'':'none';}
});
</script>
</body>
</html>
"""

def index_html(calcs):
    secs = []
    for cid, cname in CATS:
        cards = []
        for c in calcs:
            if c["cat"] != cid:
                continue
            k = (c["name"] + " " + c.get("kw", "")).lower()
            cards.append('<a class="ccard" data-k="%s" href="%s.html"><b>%s</b><span>%s</span></a>'
                         % (esc(k), c["slug"], c["name"], c["short"]))
        secs.append('<section class="catsec"><h2 class="cat">%s</h2><div class="grid">%s</div></section>'
                    % (cname, "".join(cards)))
    t = "%s — %s: %d бесплатных онлайн-расчётов" % (SITE_NAME, TAGLINE.lower(), len(calcs))
    d = ("Бесплатные онлайн-калькуляторы по электрике и электронике: сечение кабеля, выбор автомата и УЗО, "
         "закон Ома, резистор для светодиода, расчёт трансформатора и другие. С формулами и примерами.")
    return (INDEX.replace("@T@", esc(t)).replace("@D@", esc(d)).replace("@METRIKA@", METRIKA).replace("@CSS@", CSS)
                 .replace("@SECTIONS@", "".join(secs)).replace("@SITE@", SITE_NAME).replace("@TAG@", TAGLINE))

def write_site(calcs, outdir):
    os.makedirs(outdir, exist_ok=True)
    by = {c["slug"]: c for c in calcs}
    for c in calcs:
        with open(os.path.join(outdir, c["slug"] + ".html"), "w", encoding="utf-8") as f:
            f.write(page_html(c, by))
    with open(os.path.join(outdir, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_html(calcs))
    urls = ["%s/" % BASE_URL] + ["%s/%s.html" % (BASE_URL, c["slug"]) for c in calcs]
    sm = ('<?xml version="1.0" encoding="UTF-8"?>\n'
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + "".join("<url><loc>%s</loc></url>\n" % u for u in urls) + "</urlset>\n")
    with open(os.path.join(outdir, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(sm)
    with open(os.path.join(outdir, "robots.txt"), "w", encoding="utf-8") as f:
        f.write("User-agent: *\nAllow: /\nSitemap: %s/sitemap.xml\n" % BASE_URL)
    with open(os.path.join(outdir, ".nojekyll"), "w") as f:
        f.write("")
    with open(os.path.join(outdir, YANDEX_VERIFICATION), "w", encoding="utf-8") as f:
        f.write(YANDEX_VERIFICATION_HTML)
    with open(os.path.join(outdir, "README.md"), "w", encoding="utf-8") as f:
        f.write(README.replace("@COUNT@", str(len(calcs))))
    print("OK: %d pages + index + sitemap + robots + подтверждение Яндекса" % len(calcs))

README = """# ВольтКальк — сайт инженерных калькуляторов

Статический сайт: каждый калькулятор — отдельный самодостаточный HTML-файл
(стили и скрипт внутри). Открывается двойным кликом, работает на GitHub Pages.

## Структура
- `index.html` — главная (каталог + поиск)
- `*.html` — страницы калькуляторов (@COUNT@ шт.)
- `sitemap.xml`, `robots.txt` — подготовлены для адреса `https://macos2024.github.io`
- `generator/` — скрипты, которыми сгенерирован сайт (можно не трогать)
- `tests/verify.mjs` — автоматическая проверка всех страниц и контрольных расчётов
- `.nojekyll` — служебный файл для GitHub Pages, не удалять

## Пересборка и проверка
```bash
python3 generator/build.py
npm ci
npm test
```

Сайт не использует внешние зависимости при работе. `jsdom` нужен только разработчику
для локального запуска автоматических тестов и не загружается посетителями.

## Как продолжить работу с Claude в новом чате
1. Прикрепите PDF «План проекта» и/или дайте ссылку на этот репозиторий.
2. Напишите: «Продолжаем проект ВольтКальк, я на Этапе N. Следующий шаг?»

## Правила проекта
- Формулы проверяет Максим (инженер). Claude не публикует непроверенное.
- Никаких внешних библиотек и шрифтов — сайт должен открываться мгновенно.
- Запятая в полях ввода принимается как десятичный разделитель.
- Дисклеймер в подвале обязателен на каждой странице.
"""
