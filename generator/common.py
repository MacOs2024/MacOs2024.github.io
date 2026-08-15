# -*- coding: utf-8 -*-
"""Генератор статического сайта «ВольтКальк». Каждая страница самодостаточна
(стили и скрипт внутри файла) — можно открыть двойным кликом без сервера."""

import os, html, json

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

# То же самое для Google Search Console.
GOOGLE_VERIFICATION = "google42573797fafc16a7.html"
GOOGLE_VERIFICATION_HTML = "google-site-verification: google42573797fafc16a7.html"

# Фавикон: молния в фирменных цветах сайта (тёмно-зелёный фон, янтарная молния).
FAVICON = "favicon.svg"
FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="#0f2e2a"/>
<path d="M17.5 4 8 18h6.2l-1.7 10L24 14h-6.2z" fill="#f5b942"/>
</svg>
"""

CATS = [
    ("osnovy", "Основы электротехники"),
    ("provodka", "Проводка и защита"),
    ("pitanie", "Питание и энергия"),
    ("elektronika", "Электроника"),
]

# Аналитика включена по явному решению владельца проекта от 13.08.2026.
# Метрика обрабатывает cookies, сведения об устройстве и активность
# посетителя, поэтому включение действительно только вместе с политикой,
# которая это описывает: см. PRIVACY_HTML, раздел «Аналитика и cookie».
# Webvisor и карта кликов выключены намеренно — запись сессий посетителя
# не ведётся. Не менять состав собираемых данных, не обновив политику.
METRIKA = """<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=111301996', 'ym');
    ym(111301996, 'init', {ssr:true, webvisor:false, clickmap:false, trackLinks:true, accurateTrackBounce:true});
</script>
<!-- /Yandex.Metrika -->"""

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
input[type=text]{flex:1;min-width:0;padding:10px 12px;font-size:17px;border:1px solid #8a938d;border-radius:9px;background:#fbfcfa;color:#1c2422}
input[type=text]:focus{outline:2px solid #0d5c50;border-color:#0d5c50}
select{padding:10px;font-size:15px;border:1px solid #8a938d;border-radius:9px;background:#fbfcfa;max-width:100%;color:#1c2422}
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
.article a{overflow-wrap:anywhere}
.article ul{margin:8px 0;padding-left:22px}
.formula{background:#fff;border:1px solid #e2e6e0;border-radius:9px;padding:10px 14px;font-family:Consolas,Menlo,monospace;font-size:16px;overflow-x:auto;margin:10px 0}
table.t{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0;background:#fff}
table.t th,table.t td{border:1px solid #dde2dc;padding:6px 8px;text-align:center}
table.t th{background:#eef1ec}
.faq h3{font-size:16px;margin:14px 0 4px}
.related ul{padding-left:20px}
.src{margin-top:26px;background:#fff;border:1px solid #e2e6e0;border-radius:12px;padding:14px 16px;font-size:14px}
.src h2{font-size:17px;margin:0 0 8px}
.src ul{margin:6px 0;padding-left:20px}
.src .st{display:inline-block;padding:2px 9px;border-radius:20px;font-size:12px;font-weight:700;margin-left:6px;vertical-align:2px}
.src .st-verified{background:#e3f3e8;color:#1c5c33}
.src .st-agent{background:#fdf6e7;color:#7a5b10}
.src .st-estimate{background:#eef1ec;color:#4b5450}
.src .st-pending{background:#fdeaea;color:#a3352b}
footer{margin:34px auto 0;max-width:780px;padding:18px 16px 26px;font-size:13px;color:#5c6660;border-top:1px solid #e2e6e0}
.privacy-settings{margin:4px 0 0;padding:0;border:0;background:transparent;color:#0d5c50;text-decoration:underline;font:inherit;cursor:pointer}
.hero{padding:22px 0 6px}
.hero h1{font-size:27px}
.hero p{color:#3d4642}
.searchwrap{position:relative;margin:10px 0 4px}
.search{width:100%;padding:12px 40px 12px 14px;font-size:17px;border:1px solid #cdd4cf;border-radius:10px;background:#fff}
#qclear{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:30px;height:30px;border:none;background:transparent;font-size:22px;line-height:1;color:#6b746e;cursor:pointer;display:none}
#qclear.on{display:block}
#empty{margin:18px 0;padding:14px 16px;background:#fff;border:1px solid #e2e6e0;border-radius:12px;color:#4b5450}
#empty[hidden]{display:none}
.cat{font-size:20px;margin:26px 0 10px;border-left:4px solid #f5b942;padding-left:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.ccard{display:block;background:#fff;border:1px solid #e2e6e0;border-radius:12px;padding:12px 14px;text-decoration:none;color:#1c2422}
.ccard:hover{border-color:#0d5c50}
.ccard b{display:block;color:#0d5c50;margin-bottom:3px;font-size:15px}
.ccard span{font-size:13px;color:#5c6660}
@media(max-width:520px){
h1{font-size:21px}.hero h1{font-size:22px}.rr{flex-direction:column;gap:2px}
table.t{table-layout:fixed;font-size:13px}
table.t th,table.t td{padding:6px 4px;overflow-wrap:anywhere}
}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
.pdfbtn{display:none;width:100%;margin-top:10px;padding:11px;font-size:15px;font-weight:600;color:#0f2e2a;background:#eef4f0;border:1px solid #b9cdc5;border-radius:9px;cursor:pointer}
.pdfbtn:hover{background:#e2ece7}
.pdfbtn.on{display:block}
#printhead{display:none}
#printfoot{display:none}
@media print{
 @page{margin:16mm 14mm}
 body{background:#fff;font-size:12pt}
 .top,footer,.crumbs,.article,.related,.src,.pdfbtn,.btn,.btn2,.hint,#go{display:none!important}
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
function out(h){var r=$('res');r.innerHTML=h;r.removeAttribute('role');r.classList.add('on');var b=$('pdf');if(b)b.classList.add('on');if(r.scrollIntoView)r.scrollIntoView({block:'nearest'});}
function err(m){var r=$('res');r.innerHTML='<div class="rerr">'+m+'</div>';r.setAttribute('role','alert');r.classList.add('on');var b=$('pdf');if(b)b.classList.remove('on');if(r.scrollIntoView)r.scrollIntoView({block:'nearest'});}
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
<link rel="canonical" href="@CANONICAL@">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
@OG@
@SCHEMA@
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
@CALCBLOCK@
</section>
<!-- РСЯ БЛОК 1: сюда будет вставлен код рекламы на Этапе 4 -->
<section class="article">
@ARTICLE@
</section>
<!-- РСЯ БЛОК 2: сюда будет вставлен код рекламы на Этапе 4 -->
@SOURCES@
<section class="related"><h2>Смотрите также</h2><ul>@RELATED@</ul></section>
</main>
<footer>© @SITE@ — @TAG@.<br>Расчёты носят справочный характер и не заменяют проект и нормативные документы (ПУЭ, ГОСТ). Для ответственных решений консультируйтесь со специалистом. Работы в электроустановках выполняйте при снятом напряжении.<br><a href="about.html">О проекте</a> · <a href="privacy.html">Политика конфиденциальности</a></footer>
<script>
@HELPERS@
@JS@
</script>
</body>
</html>
"""

def esc(s):
    return html.escape(s, quote=True)

OG_IMAGE = "og-image.png"
OG_IMAGE_W = 1200
OG_IMAGE_H = 630

def og_tags(title, desc, url):
    """Open Graph: как ссылка выглядит при репосте в мессенджерах и на форумах."""
    return "\n".join([
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="%s">' % esc(SITE_NAME),
        '<meta property="og:locale" content="ru_RU">',
        '<meta property="og:title" content="%s">' % esc(title),
        '<meta property="og:description" content="%s">' % esc(desc),
        '<meta property="og:url" content="%s">' % esc(url),
        '<meta property="og:image" content="%s/%s">' % (BASE_URL, OG_IMAGE),
        '<meta property="og:image:width" content="%d">' % OG_IMAGE_W,
        '<meta property="og:image:height" content="%d">' % OG_IMAGE_H,
        '<meta property="og:image:alt" content="%s — инженерные калькуляторы по электрике">' % esc(SITE_NAME),
        '<meta name="twitter:card" content="summary_large_image">',
    ])

def seo_title(c):
    """Короткий title без механического обрезания ключевой фразы.

    Полный редакционный заголовок остаётся в исходных данных и h1. Для title
    сначала используем имя калькулятора с брендом, затем имя без бренда. Если
    и оно длиннее 60 символов, обрезаем только по границе слова.
    """
    branded = "%s — %s" % (c["name"], SITE_NAME)
    if len(branded) <= 60:
        return branded
    if len(c["name"]) <= 60:
        return c["name"]
    words = c["name"].split()
    result = ""
    for word in words:
        candidate = (result + " " + word).strip()
        if len(candidate) > 57:
            break
        result = candidate
    return (result or c["name"][:57].rstrip()) + "…"

STATUS_LABEL = {
    "verified": ("Независимо проверено", "st-verified"),
    "agent-reviewed": ("Сверено с источником и тестами", "st-agent"),
    "estimate": ("Оценка, не нормативный вердикт", "st-estimate"),
    "pending": ("Ожидает проверки", "st-pending"),
}

def sources_html(c):
    """Карточка источника: на чём основан расчёт и в каком он статусе.

    Поле reviewed_by отражает фактическую проверку. Имя владельца нельзя
    указывать без его реального инженерного просмотра.
    """
    st = c.get("review_status")
    if not st and not c.get("sources"):
        return ""
    parts = ['<section class="src"><h2>Основание расчёта']
    if st:
        label, cls = STATUS_LABEL.get(st, (st, "st-pending"))
        parts.append('<span class="st %s">%s</span>' % (cls, esc(label)))
    parts.append("</h2>")
    if c.get("sources"):
        parts.append("<p><b>Источники:</b></p><ul>")
        for src in c["sources"]:
            bits = []
            title = esc(src["title"])
            if src.get("url"):
                title = '<a href="%s" rel="nofollow noopener" target="_blank">%s</a>' % (esc(src["url"]), title)
            bits.append(title)
            for key, prefix in (("organization", ""), ("edition", "Редакция "), ("sections", "раздел ")):
                v = src.get(key)
                if not v:
                    continue
                if isinstance(v, (list, tuple)):
                    v = ", ".join(v)
                bits.append(prefix + esc(str(v)))
            if src.get("accessed"):
                bits.append("обращение " + esc(src["accessed"]))
            parts.append("<li>%s</li>" % " — ".join(bits))
        parts.append("</ul>")
    for key, head in (("assumptions", "Допущения"), ("limitations", "Границы применимости")):
        if c.get(key):
            parts.append("<p><b>%s:</b></p><ul>%s</ul>"
                         % (head, "".join("<li>%s</li>" % x for x in c[key])))
    if c.get("reviewed_by"):
        parts.append("<p>Проверил: %s, %s</p>"
                     % (esc(c["reviewed_by"]), esc(c.get("reviewed_at", "дата не указана"))))
    parts.append("</section>")
    return "".join(parts)

def ld_json(obj):
    """JSON-LD микроразметка. '<' экранируется, чтобы содержимое не могло закрыть <script>."""
    body = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    return '<script type="application/ld+json">%s</script>' % body

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
        unit_html = '<select id="%s_unit" class="u" aria-label="Единицы: %s">%s</select>' % (fid, esc(f["label"]), o)
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
    canonical = "%s/%s.html" % (BASE_URL, c["slug"])
    notice = bool(c.get("notice"))
    # Информационная страница: калькулятора нет, поэтому нет ни формы, ни
    # кнопок расчёта и PDF. Такая страница остаётся по прежнему URL, если он
    # уже был проиндексирован, но ничего не вычисляет.
    if notice:
        calcblock = ('<div class="rerr">%s</div>' % c["notice"])
        article = c["about"]
    else:
        calcblock = (
            '<div id="printhead"><div class="pt">⚡ ВольтКальк — %s</div>'
            '<div class="pd" id="pdate"></div></div>\n'
            '<div id="pvals"></div>\n%s\n'
            '<button id="go" class="btn" type="button">Рассчитать</button>\n'
            '<div id="res" class="result" aria-live="polite"></div>\n'
            '<button id="pdf" class="pdfbtn" type="button">📄 Сохранить расчёт в PDF</button>\n'
            '<div id="printfoot">Расчёт выполнен на ВольтКальк (https://macos2024.github.io). '
            'Носит справочный характер и не заменяет проект и нормативные документы (ПУЭ, ГОСТ).</div>'
            % (c["name"], fields))
        article = ("<h2>Как считается</h2>\n%s\n<h2>Пример расчёта</h2>\n%s\n"
                   '<div class="faq"><h2>Частые вопросы</h2>\n%s\n</div>'
                   % (c["about"], c["example"], faqs))
    main_node = {
        "@type": "WebPage",
        "name": c["name"],
        "url": canonical,
        "description": c["desc"],
        "inLanguage": "ru",
        "publisher": {"@type": "Organization", "name": SITE_NAME, "url": BASE_URL + "/"},
    } if notice else {
        "@type": "WebApplication",
        "name": c["name"],
        "url": canonical,
        "description": c["desc"],
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": "Any",
        "browserRequirements": "Требуется JavaScript",
        "inLanguage": "ru",
        "isAccessibleForFree": True,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "RUB"},
        "publisher": {"@type": "Organization", "name": SITE_NAME, "url": BASE_URL + "/"},
    }
    graph = [main_node, {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Главная", "item": BASE_URL + "/"},
            {"@type": "ListItem", "position": 2, "name": c["name"], "item": canonical},
        ],
    }]
    if c.get("faqs"):
        graph.append({
            "@type": "FAQPage",
            "mainEntity": [{"@type": "Question", "name": q,
                            "acceptedAnswer": {"@type": "Answer", "text": a}}
                           for q, a in c["faqs"]],
        })
    title = seo_title(c)
    h = (PAGE.replace("@TITLE@", esc(title))
             .replace("@DESC@", esc(c["desc"]))
             .replace("@CANONICAL@", esc(canonical))
             .replace("@OG@", og_tags(title, c["desc"], canonical))
             .replace("@SCHEMA@", ld_json({"@context": "https://schema.org", "@graph": graph}))
             .replace("@METRIKA@", METRIKA)
             .replace("@CSS@", CSS)
             .replace("@CAT@", cat_name)
             .replace("@NAME@", c["name"])
             .replace("@INTRO@", c["intro"])
             .replace("@CALCBLOCK@", calcblock)
             .replace("@ARTICLE@", article)
             .replace("@SOURCES@", sources_html(c))
             .replace("@RELATED@", rel)
             .replace("@HELPERS@", HELPERS_JS)
             .replace("@JS@", c.get("js", ""))
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
<link rel="canonical" href="@CANONICAL@">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
@OG@
@SCHEMA@
@METRIKA@
<style>@CSS@</style>
</head>
<body>
<header class="top"><a class="brand" href="index.html">⚡ Вольт<em>Кальк</em></a></header>
<main>
<div class="hero">
<h1>Инженерные калькуляторы по электрике</h1>
<p>Бесплатные расчёты для электриков, радиолюбителей и домашних мастеров: сечение кабеля, автоматы, резисторы, конденсаторы, трансформаторы. Формулы и примеры — под каждым калькулятором.</p>
<div class="searchwrap"><input class="search" id="q" type="text" placeholder="Поиск: например, «сечение», «светодиод», «УЗО»…" aria-label="Поиск по калькуляторам"><button id="qclear" type="button" aria-label="Очистить поиск">×</button></div>
<div id="empty" hidden>Ничего не найдено. Проверьте раскладку или попробуйте другое слово — например, «кабель», «автомат», «резистор».</div>
</div>
@SECTIONS@
</main>
<footer>© @SITE@ — @TAG@.<br>Расчёты носят справочный характер и не заменяют проект и нормативные документы (ПУЭ, ГОСТ). Для ответственных решений консультируйтесь со специалистом.<br><a href="about.html">О проекте</a> · <a href="privacy.html">Политика конфиденциальности</a></footer>
<script>
var q=document.getElementById('q'),qclear=document.getElementById('qclear'),empty=document.getElementById('empty');
// Нормализация: регистр, ё, дефисы и повторные пробелы не должны влиять на поиск.
function norm(s){return String(s).toLowerCase().replace(/ё/g,'е').replace(/[-\u2010-\u2015]/g,' ').replace(/\\s+/g,' ').trim();}
// Ограниченный словарь синонимов: только близкие обозначения одного и того же.
var FORMS={'кабеля':'кабель','кабелей':'кабель','кабельный':'кабель','кабельная':'кабель',
'провода':'провод','проводника':'провод','проводников':'провод',
'автоматический':'автомат','автоматического':'автомат','автоматические':'автомат'};
var SYN={'автомат':['выключатель'],'выключатель':['автомат'],
'узо':['дифзащита','дифференциальн'],'дифзащита':['узо'],
'кабель':['провод'],'провод':['кабель']};
var cards=document.querySelectorAll('.ccard');
for(var i=0;i<cards.length;i++)cards[i].setAttribute('data-n',norm(cards[i].getAttribute('data-k')));
function hit(text,token){
 if(text.indexOf(token)>=0)return true;
 var alt=SYN[token];
 if(alt)for(var a=0;a<alt.length;a++)if(text.indexOf(alt[a])>=0)return true;
 return false;
}
function apply(){
 var tokens=norm(q.value).split(' ').filter(function(t){return t.length>0;}).map(function(t){return FORMS[t]||t;});
 var shown=0;
 for(var i=0;i<cards.length;i++){
  var text=cards[i].getAttribute('data-n'),ok=true;
  // Карточка подходит, если содержит ВСЕ токены — порядок слов не важен.
  for(var t=0;t<tokens.length;t++){if(!hit(text,tokens[t])){ok=false;break;}}
  cards[i].style.display=ok?'':'none';
  if(ok)shown++;
 }
 var secs=document.querySelectorAll('.catsec');
 for(var j=0;j<secs.length;j++){
  var vis=0,inner=secs[j].querySelectorAll('.ccard');
  for(var k=0;k<inner.length;k++)if(inner[k].style.display!=='none')vis++;
  secs[j].style.display=vis?'':'none';
 }
 if(empty)empty.hidden=!(tokens.length>0&&shown===0);
 if(qclear)qclear.className=q.value?'on':'';
}
q.addEventListener('input',apply);
if(qclear)qclear.addEventListener('click',function(){q.value='';apply();q.focus();});
apply();
</script>
</body>
</html>
"""

def index_html(calcs):
    secs = []
    for cid, cname in CATS:
        cards = []
        for c in calcs:
            if c["cat"] != cid or c.get("notice"):
                continue
            k = (c["name"] + " " + c.get("kw", "")).lower()
            cards.append('<a class="ccard" data-k="%s" href="%s.html"><b>%s</b><span>%s</span></a>'
                         % (esc(k), c["slug"], c["name"], c["short"]))
        secs.append('<section class="catsec"><h2 class="cat">%s</h2><div class="grid">%s</div></section>'
                    % (cname, "".join(cards)))
    real = [c for c in calcs if not c.get("notice")]
    t = "%s — %d бесплатных калькуляторов по электрике" % (SITE_NAME, len(real))
    d = ("Бесплатные онлайн-калькуляторы по электрике и электронике: сечение кабеля, выбор автомата и УЗО, "
         "закон Ома, резистор для светодиода, расчёт трансформатора и другие. С формулами и примерами.")
    home = BASE_URL + "/"
    graph = [{
        "@type": "WebSite",
        "name": SITE_NAME,
        "alternateName": "VoltCalc",
        "url": home,
        "description": d,
        "inLanguage": "ru",
    }, {
        "@type": "ItemList",
        "name": "Каталог инженерных калькуляторов",
        "numberOfItems": len(real),
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": x["name"],
             "url": "%s/%s.html" % (BASE_URL, x["slug"])}
            for i, x in enumerate(real)
        ],
    }]
    return (INDEX.replace("@T@", esc(t)).replace("@D@", esc(d))
                 .replace("@CANONICAL@", esc(home))
                 .replace("@OG@", og_tags(t, d, home))
                 .replace("@SCHEMA@", ld_json({"@context": "https://schema.org", "@graph": graph}))
                 .replace("@METRIKA@", METRIKA).replace("@CSS@", CSS)
                 .replace("@SECTIONS@", "".join(secs)).replace("@SITE@", SITE_NAME).replace("@TAG@", TAGLINE))

# Страница «О проекте». В отличие от политики — индексируемая: для тем,
# влияющих на безопасность, поисковые системы требуют понимать, кто отвечает
# за содержание и как оно проверяется. Здесь описана только та методика,
# которая действительно применяется и проверяется тестами; квалификацию
# оператора сайта вписывает владелец — выдумывать её нельзя.
ABOUT_HTML = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>О проекте — @SITE@</title>
<meta name="description" content="Как устроены расчёты @SITE@: источники под каждой формулой, статусы инженерной проверки, эталонные тесты и честные ограничения.">
<link rel="canonical" href="@BASE@/about.html">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="О проекте @SITE@">
<meta property="og:description" content="Источники под каждой формулой, статусы инженерной проверки и честные ограничения расчётов.">
<meta property="og:url" content="@BASE@/about.html">
<meta property="og:image" content="@BASE@/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<style>@CSS@</style>
@METRIKA@
</head>
<body>
<header class="top"><a class="brand" href="index.html">⚡ Вольт<em>Кальк</em></a><a class="all" href="index.html">Все калькуляторы</a></header>
<main>
<nav class="crumbs"><a href="index.html">Главная</a> › О проекте</nav>
<h1>О проекте</h1>
<p class="intro">@SITE@ — набор инженерных калькуляторов по электрике: сечение кабеля, защитная аппаратура, трансформаторы, электроника. Расчёты бесплатны, не требуют регистрации и целиком выполняются в вашем браузере.</p>
<section class="article">
<h2>Как устроены расчёты</h2>
<p>Каждая страница самодостаточна: формула считается на вашем устройстве, введённые значения никуда не отправляются и нигде не сохраняются. Под каждым калькулятором — сама формула, разобранный пример и карточка «Основание расчёта»: документ-источник, его редакция, конкретные разделы и границы применимости.</p>
<p>Исходный код сайта открыт, поэтому историю правок любой формулы можно посмотреть в <a href="https://github.com/MacOs2024/MacOs2024.github.io" rel="noopener" target="_blank">репозитории проекта</a>.</p>
<h2>Что означает статус у расчёта</h2>
<table class="t">
<tr><th>Статус</th><th>Что он означает</th></tr>
<tr><td>Сверено с источником и тестами</td><td>Формула сверена с указанным первоисточником и покрыта эталонными тестами</td></tr>
<tr><td>Оценка, не нормативный вердикт</td><td>Физическая модель с явными допущениями: зависит от паспортных данных, геометрии, температуры или измерения</td></tr>
<tr><td>Ожидает проверки</td><td>Расчёт снят с публикации либо намеренно не выдаёт вердикт</td></tr>
</table>
<div class="rerr"><b>Ни одному расчёту не присвоен статус «независимо проверено».</b> Это значит, что независимой проверки практикующим инженером не проводилось. Реестр статусов ведётся открыто в файле <code>ENGINEERING_AUDIT.md</code> в репозитории.</div>
<h2>Как проверяются формулы</h2>
<ol>
<li>Формула не меняется без первоисточника, его редакции и эталонного теста.</li>
<li>Ожидаемые значения в тестах выписываются вручную из правила, а не вычисляются тем же кодом, что и страница: иначе тест повторил бы ошибку вместе с реализацией.</li>
<li>У каждого калькулятора минимум два функциональных сценария, проверка границ диапазонов и проверка неверного ввода.</li>
<li>Вёрстка и работа страниц проверяются в настоящем браузере — на компьютере и на телефоне.</li>
<li>Если исходных данных недостаточно для однозначного вывода, расчёт обязан сказать «недостаточно данных», а не «проходит».</li>
</ol>
<h2>Чего эти калькуляторы не заменяют</h2>
<p>Расчёты носят справочный характер. Они <b>не заменяют</b> проект, нормативные документы (ПУЭ, ГОСТ, СП) и решение ответственного специалиста. Для монтажа, приёмки и любых работ, где ошибка угрожает жизни или имуществу, обращайтесь к квалифицированному электрику или проектировщику.</p>
<p>Работы в электроустановках выполняйте при снятом напряжении.</p>
<h2>Нашли ошибку?</h2>
<p>Сообщения об ошибках в формулах особенно ценны. Опишите расчёт, введённые значения, полученный и ожидаемый результат — по возможности со ссылкой на норматив. Написать можно через <a href="https://github.com/MacOs2024/MacOs2024.github.io/issues" rel="noopener" target="_blank">issues в репозитории проекта</a>.</p>
</section>
</main>
<footer>© @SITE@ — @TAG@.<br>Расчёты носят справочный характер и не заменяют проект и нормативные документы (ПУЭ, ГОСТ). Для ответственных решений консультируйтесь со специалистом.<br><a href="index.html">На главную</a> · <a href="privacy.html">Политика конфиденциальности</a></footer>
</body>
</html>
"""

PRIVACY_HTML = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Политика конфиденциальности — @SITE@</title>
<meta name="description" content="Какие данные собирает сайт @SITE@, с какой целью, кто их обрабатывает и как долго они хранятся.">
<link rel="canonical" href="@BASE@/privacy.html">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<meta name="robots" content="noindex,follow">
<style>@CSS@</style>
</head>
<body>
<header class="top"><a class="brand" href="index.html">⚡ Вольт<em>Кальк</em></a><a class="all" href="index.html">Все калькуляторы</a></header>
<main>
<nav class="crumbs"><a href="index.html">Главная</a> › Политика конфиденциальности</nav>
<h1>Политика конфиденциальности</h1>
<p class="intro">Сайт не просит регистрации и не отправляет значения из калькуляторов на сервер. Для сбора обезличенной посещаемости используется Яндекс.Метрика — без записи сессий посетителя.</p>
<section class="article">
<h2>Что происходит с данными калькуляторов</h2>
<p>Все расчёты выполняются <b>в вашем браузере</b>. Код сайта не отправляет введённые значения и не сохраняет их в cookie или локальном хранилище. Закрытие или обновление вкладки очищает поля.</p>
<p>Экспорт результата в PDF выполняется средствами браузера через окно печати. Файл создаётся на вашем устройстве, на сайт он не отправляется.</p>
<h2>Аналитика и cookie</h2>
<p>На сайте установлена <b>Яндекс.Метрика</b> (счётчик № 111301996). Она нужна оператору сайта, чтобы понимать посещаемость и то, какие калькуляторы востребованы. Метрика устанавливает собственные cookie и обрабатывает обезличенные сведения о посещении: адрес страницы, источник перехода, IP-адрес, тип устройства и браузера, язык, разрешение экрана, время и глубину просмотра.</p>
<p><b>Что намеренно выключено:</b> Вебвизор (запись действий посетителя на странице), карта кликов и карта скроллинга. Записи ваших сессий не ведутся и не хранятся.</p>
<p>Значения, введённые в калькуляторы, в Метрику <b>не передаются</b>: расчёт целиком выполняется в браузере. Собственных cookie, помимо метрических, код сайта не создаёт.</p>
<p>Обработчиком статистики выступает ООО «Яндекс» в рамках сервиса Яндекс.Метрика. Условия обработки и сроки хранения определяются <a href="https://yandex.ru/legal/confidential/" rel="nofollow noopener" target="_blank">политикой конфиденциальности Яндекса</a>. Оператор сайта доступа к сырым данным отдельных посетителей не имеет — только к агрегированным отчётам.</p>
<p><b>Как отказаться.</b> Сбор статистики можно прекратить: запретить cookie для этого сайта в настройках браузера, включить режим, блокирующий трекеры, или воспользоваться <a href="https://yandex.ru/support/metrica/general/opt-out.html" rel="nofollow noopener" target="_blank">блокировщиком Яндекс.Метрики</a>. На работу калькуляторов это не влияет — они полностью функциональны без аналитики.</p>
<h2>Технические данные хостинга</h2>
<p>Страницы размещены на GitHub Pages. При обычной загрузке страницы хостинг-провайдер и сетевые посредники могут технически обрабатывать IP-адрес, время запроса, адрес страницы, браузер и другие данные запроса. Это происходит на стороне инфраструктуры GitHub, а не в калькуляторах. Условия такой обработки описаны в <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" rel="nofollow noopener" target="_blank">заявлении GitHub о конфиденциальности</a>.</p>
<h2>Обратная связь</h2>
<p>Вопросы по обработке данных, а также требования об уточнении или удалении информации направляйте оператору сайта через контакт, указанный в профиле репозитория проекта на GitHub: <a href="https://github.com/MacOs2024/MacOs2024.github.io" rel="nofollow noopener" target="_blank">github.com/MacOs2024/MacOs2024.github.io</a>.</p>
<h2>Изменения</h2>
<p>Актуальная редакция всегда доступна по этому адресу. Дата последнего изменения соответствует дате последнего коммита в репозитории проекта.</p>
</section>
</main>
<footer>© @SITE@ — @TAG@.<br>Расчёты носят справочный характер и не заменяют проект и нормативные документы (ПУЭ, ГОСТ). Для ответственных решений консультируйтесь со специалистом.<br><a href="index.html">На главную</a></footer>
</body>
</html>
"""

def write_site(calcs, outdir):
    os.makedirs(outdir, exist_ok=True)
    by = {c["slug"]: c for c in calcs}
    for c in calcs:
        with open(os.path.join(outdir, c["slug"] + ".html"), "w", encoding="utf-8") as f:
            f.write(page_html(c, by))
    with open(os.path.join(outdir, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_html(calcs))
    # about.html индексируется наравне с калькуляторами: это страница о том,
    # кто отвечает за расчёты и как они проверяются. privacy.html закрыт
    # от индексации и в sitemap не попадает.
    urls = ["%s/" % BASE_URL, "%s/about.html" % BASE_URL] + [
        "%s/%s.html" % (BASE_URL, c["slug"]) for c in calcs if not c.get("notice")]
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
    with open(os.path.join(outdir, GOOGLE_VERIFICATION), "w", encoding="utf-8") as f:
        f.write(GOOGLE_VERIFICATION_HTML)
    with open(os.path.join(outdir, FAVICON), "w", encoding="utf-8") as f:
        f.write(FAVICON_SVG)
    with open(os.path.join(outdir, "privacy.html"), "w", encoding="utf-8") as f:
        f.write(PRIVACY_HTML.replace("@CSS@", CSS)
                            .replace("@SITE@", SITE_NAME).replace("@TAG@", TAGLINE)
                            .replace("@BASE@", BASE_URL))
    with open(os.path.join(outdir, "about.html"), "w", encoding="utf-8") as f:
        f.write(ABOUT_HTML.replace("@CSS@", CSS).replace("@METRIKA@", METRIKA)
                          .replace("@SITE@", SITE_NAME).replace("@TAG@", TAGLINE)
                          .replace("@BASE@", BASE_URL))
    with open(os.path.join(outdir, "README.md"), "w", encoding="utf-8") as f:
        f.write(README.replace("@COUNT@", str(len(calcs))))
    print("OK: %d pages + index + sitemap + robots + верификация Яндекса и Google + favicon" % len(calcs))

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

Сайт не использует внешние библиотеки для расчётов: страница считает и
печатает без сети. Единственная внешняя зависимость — счётчик Яндекс.Метрики
(Вебвизор и карта кликов выключены), состав собираемых данных описан в
`privacy.html`. `jsdom` нужен разработчику для локального запуска
автоматических тестов и посетителями не загружается.

## Как продолжить работу с Claude в новом чате
1. Прикрепите PDF «План проекта» и/или дайте ссылку на этот репозиторий.
2. Напишите: «Продолжаем проект ВольтКальк, я на Этапе N. Следующий шаг?»

## Правила проекта
- Для нормативных выводов нужны первоисточник, независимая проверка и тесты.
- Никаких внешних библиотек и шрифтов — сайт должен открываться мгновенно.
- Запятая в полях ввода принимается как десятичный разделитель.
- Дисклеймер в подвале обязателен на каждой странице.
"""
