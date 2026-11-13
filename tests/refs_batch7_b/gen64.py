# -*- coding: utf-8 -*-
"""Эталоны страницы shum-prinimnika-kaskad. Decimal (70 знаков): линейные F и G по определению,
формула Фрииса прямым суммированием, перестановки — itertools. Без кода страницы."""
from hp import *
from gcommon import *
from itertools import permutations

F64 = "shum-prinimnika-kaskad.html"
KB = D("1.380649e-23"); T0 = D(290)

def p10(x): return D(10) ** (D(x) / 10)

class St:
    def __init__(s, kind, g, nf=None):
        s.kind, s.g = kind, D(g)
        if kind == "att":
            s.F = p10(g); s.G = 1 / p10(g); s.gdb = -D(g)
        else:
            s.F = p10(nf); s.G = p10(g); s.gdb = D(g)
        s.nf = nf
    def desc(s):
        if s.kind == "att": return "аттенюатор, потери L = " + db(s.g) + " дБ (F = L, G = 1/L)"
        return "G = " + db(s.g) + " дБ, NF = " + db(s.nf) + " дБ"

def chain(order, st):
    """Формула Фрииса в явном виде: F = F1 + (F2 − 1)/G1 + (F3 − 1)/(G1·G2) + …"""
    gprev = D(1); F = None; contrib = []; cum = []
    tot = D(0)
    for j, i in enumerate(order):
        s = st[i]
        c = (s.F - 1) / gprev
        contrib.append(c); tot += c
        cum.append(10 * lg(1 + tot))
        gprev *= s.G
    return 1 + tot, contrib, cum, 10 * lg(gprev)

def best_order(st):
    n = len(st); bestp = list(range(n)); bf = chain(bestp, st)[0]
    for p in permutations(range(n)):
        f = chain(list(p), st)[0]
        if f < bf - bf * D("1e-12"): bf, bestp = f, list(p)
    return bestp

def db(x):
    x = D(x)
    if x != 0 and abs(x) < D("0.001"): return ("−" if x < 0 else "") + "меньше 0,001"
    return fmtnum(x)
def fl(x): return fmtnum(x) if D(x) < 10 ** 6 else "свыше миллиона"
def kk(x):
    x = D(x)
    if x == 0: return "0 К"
    if x < D("0.001"): return "меньше 0,001 К"
    if x >= 10 ** 6: return "свыше миллиона К"
    return fmtnum(x) + " К"
def pc(sh): return "меньше 0,0001 %" if sh < D("1e-6") else fmtnum(100 * sh) + " %"

def frags(st, n, order="asis", B=1e6, snr=None, ta=None, ps=None):
    st = st[:n]
    idx = list(range(n))
    bo = best_order(st)
    ord_ = idx if order == "asis" else (idx[::-1] if order == "rev" else bo)
    F, contrib, cum, gsum = chain(ord_, st)
    nft = 10 * lg(F); S = F - 1; te = S * T0
    kt = 10 * lg(KB * T0 * 1000)
    Nstd = kt + 10 * lg(B) + nft
    N = Nstd
    if ta is not None: N = 10 * lg(KB * (D(ta) + te) * D(B) * 1000)
    out = []
    for j in range(n):
        sh = contrib[j] / S if S > 0 else D(0)
        out.append("Позиция " + str(j + 1) + ": каскад " + str(ord_[j] + 1) + " — " + st[ord_[j]].desc() + "вклад " + (pc(sh) if S > 0 else "0 %") + " избыточного шума; КШ цепочки до этой позиции включительно " + db(cum[j]) + " дБ")
    out.append("Суммарное усиление цепочки" + db(gsum) + " дБ")
    out.append("Коэффициент шума цепочки F = F1 + (F2 − 1)/G1 + (F3 − 1)/(G1·G2) + …" + fl(F) + " (" + db(nft) + " дБ)")
    out.append("Шумовая температура цепочки Te = (F − 1)·T0, T0 = 290 К" + kk(te))
    fa, _, _, _ = chain(idx, st); fr, _, _, _ = chain(idx[::-1], st); fb, _, _, _ = chain(bo, st)
    out.append("Для сравнения: как введено / обратный / наилучший порядок" + db(10 * lg(fa)) + " дБ / " + db(10 * lg(fr)) + " дБ / " + db(10 * lg(fb)) + " дБ (порядок " + "-".join(str(x + 1) for x in bo) + ")")
    out.append("Тепловой шум kT0 при T0 = 290 К (округляют до −174)" + fmtnum(kt, 5) + " дБм/Гц")
    out.append("Порог шума приёмника N = kT0 + 10·lg B + NF" + (" — при источнике Ta" if ta is not None else "") + fmtnum(N) + " дБм (" + pw(N) + ")")
    if ta is not None:
        out.append("Шумовая температура системы Tсист = Ta + Te" + kk(D(ta) + te))
        out.append("Для сравнения: порог шума при стандартном T0" + fmtnum(Nstd) + " дБм")
    out.append("Минимальный обнаружимый сигнал MDS (SNR = 0 дБ)" + fmtnum(N) + " дБм (" + pw(N) + ")")
    sm = None
    if snr is not None:
        sm = N + D(snr)
        out.append("Чувствительность при SNR = " + fmtnum(snr) + " дБ: Smin = MDS + SNR" + fmtnum(sm) + " дБм (" + pw(sm) + ")")
    so = None
    if ps is not None:
        so = D(ps) - N
        out.append("Отношение сигнал/шум при уровне сигнала " + fmtnum(ps) + " дБм" + (fx(so, snr) if snr is not None else fmtnum(so)) + " дБ")
    ordtxt = {"asis": "в порядке ввода", "rev": "в обратном порядке", "best": "в наилучшем порядке " + "-".join(str(x + 1) for x in bo)}[order]
    if ps is not None and snr is not None:
        if float(so) >= float(snr) - abs(float(snr)) * 1e-9:
            stt = "Оценка: отношение сигнал/шум " + fx(so, snr) + " дБ не меньше требуемых " + fx(snr, so) + " дБ при тепловом шуме"
        else:
            stt = "Оценка: отношение сигнал/шум " + fx(so, snr) + " дБ меньше требуемых " + fx(snr, so) + " дБ — не хватает " + db(D(snr) - so) + " дБ"
    elif ps is not None:
        stt = "Недостаточно данных для вывода о приёме: требуемое SNR не задано; отношение сигнал/шум при заданном уровне " + fmtnum(so) + " дБ"
    elif snr is not None:
        stt = "Оценка: для SNR " + fmtnum(snr) + " дБ нужен сигнал на входе не ниже " + fmtnum(sm) + " дБм; уровень сигнала не задан — вывода о приёме нет"
    else:
        stt = "Оценка: коэффициент шума цепочки " + db(nft) + " дБ " + ordtxt + ", MDS " + fmtnum(N) + " дБм; требуемое SNR и уровень сигнала не заданы — вывода о приёме нет"
    out.append("Статус" + stt)
    return out, dict(F=F, nft=nft, N=N, so=so, sm=sm, bo=bo, te=te)

DEF = [St("act", 20, "1.5"), St("att", 3), St("act", 15, "6"), St("act", 10, "8"), St("att", 1)]

def vals(n=3, order="asis", stages=None, **extra):
    """значения полей: stages — список (kind, g, nf)"""
    v = {}
    if n != 3: v["n"] = str(n)
    if order != "asis": v["ord"] = order
    if stages:
        for i, (k, g, e) in enumerate(stages, 1):
            v[f"k{i}"] = k; v[f"g{i}"] = str(g)
            if e is not None: v[f"e{i}"] = str(e)
    v.update({k: str(x) for k, x in extra.items()})
    return v

def mk(stages):
    return [St(k, g, e) if k == "act" else St("att", g) for k, g, e in stages]

def gen():
    sec("3. shum-prinimnika-kaskad: Friis 1944, Pozar гл. 10, лекция UBC; пассивный аттенюатор F = L")
    comment("Эталоны посчитаны скриптом tests/refs_batch7_b/gen64.py на decimal.Decimal (70 знаков): F и G каскадов из дБ по определению 10^(x/10),",
            "формула Фрииса — явным суммированием F1 + (F2 − 1)/G1 + …, NF = 10·lg F, Te = (F − 1)·290, kT0 = 10·lg(1,380649e-23·290·1000) дБм/Гц,",
            "N = kT0 + 10·lg B + NF (или 10·lg(k·(Ta + Te)·B·1000) при заданной Ta); порядок «лучший» — прямой перебор всех перестановок itertools.",
            "Проверка вручную: потери 3 дБ перед усилителем G = 20 дБ, NF = 3 дБ: F = L·F2 → NF = 3 + 3 = 6 дБ (эталон ниже, точно).")
    # Эталон 1: умолчания
    out, r = frags(DEF, 3)
    comment(f"Эталон 1 (умолчания): МШУ 20 дБ/1,5 дБ, кабель 3 дБ, усилитель 15 дБ/6 дБ: F = {fmtnum(r['F'],8)} ({fmtnum(r['nft'],8)} дБ); Te = {fmtnum(r['te'],6)} К; N = {fmtnum(r['N'],8)} дБм в полосе 1 МГц.",
            "Вручную: F1 = 1,4125, (F2 − 1)/G1 = 0,01, (F3 − 1)/(G1G2) = 2,981/(100·0,50119) = 0,0595 → 1,4825 ≈ 1,482.")
    calc(F64, {}, out, ["Недостаточно данных"])
    # Обратный порядок: кабель и усилитель впереди
    for od in ["rev", "best"]:
        out, r = frags(DEF, 3, od)
        comment(f"Порядок «{od}»: F = {fmtnum(r['F'],8)} ({fmtnum(r['nft'],8)} дБ), порядок перебором {'-'.join(str(x+1) for x in r['bo'])}; переключатель ord меняет цепочку.")
        calc(F64, {"ord": od}, out)
    # Точный эталон: потери 3 дБ + усилитель NF 3 дБ → 6 дБ
    st = [("att", "3", None), ("act", "20", "3")]
    out, r = frags(mk(st), 2, B=1e6)
    comment(f"Точный эталон: F = L·F2 = 10^0,3·10^0,3 = 10^0,6 → NF = 6 дБ ровно; вычислено: {fmtnum(r['nft'],12)} дБ.")
    calc(F64, vals(2, "asis", st), out + ["Коэффициент шума цепочки F = F1 + (F2 − 1)/G1 + (F3 − 1)/(G1·G2) + …3,981 (6 дБ)"])
    # Два аттенюатора 3 + 3 → 6 дБ = F = L суммарное
    st = [("att", "3", None), ("att", "3", None)]
    out, r = frags(mk(st), 2)
    comment(f"Два аттенюатора 3 + 3 дБ: суммарные потери 6 дБ, F = L = 10^0,6 = 3,981 (NF = 6 дБ); вычислено {fmtnum(r['nft'],12)} дБ; усиление −6 дБ.")
    calc(F64, vals(2, "asis", st), out + ["Суммарное усиление цепочки-6 дБ", "(6 дБ)"], None, "boundary")
    # n = 2: МШУ + кабель; в обратном порядке
    st = [("act", "20", "1.5"), ("att", "3", None)]
    for od in ["asis", "rev"]:
        out, r = frags(mk(st), 2, od)
        calc(F64, vals(2, od, st), out)
    # n = 4 и n = 5 с перебором 120 перестановок
    for n in [4, 5]:
        out, r = frags(DEF, n, "best")
        comment(f"n = {n}, наилучший порядок перебором {'-'.join(str(x+1) for x in r['bo'])} (F = {fmtnum(r['F'],8)}).")
        calc(F64, vals(n, "best"), out)
    out, r = frags(DEF, 5, "rev")
    calc(F64, vals(5, "rev"), out)
    # Отрицательное усиление активного каскада (смеситель с потерями) и NF = 0
    st = [("act", "-7", "7"), ("act", "30", "2"), ("act", "0", "0")]
    out, r = frags(mk(st), 3, "asis")
    comment("Активный каскад с отрицательным усилением (смеситель −7 дБ, NF 7 дБ) и каскад с G = 0 дБ, NF = 0 дБ (граничные нули).")
    calc(F64, vals(3, "asis", st), out, None, "boundary")
    out, r = frags(mk(st), 3, "best")
    calc(F64, vals(3, "best", st), out, None, "boundary")
    # Идеальные каскады: F = 1, шума нет, вклад 0
    st = [("act", "10", "0"), ("att", "0", None), ("act", "5", "0")]
    out, r = frags(mk(st), 3)
    comment("Идеальная цепочка: NF = 0 дБ, потери 0 дБ → F = 1, Te = 0 К, все вклады 0; порог шума — только kT0 + 10·lg B.")
    calc(F64, vals(3, "asis", st), out, None, "boundary")
    # Одинаковые каскады: лучший порядок = исходный (первая из равных)
    st = [("act", "10", "3"), ("act", "10", "3"), ("act", "10", "3")]
    out, r = frags(mk(st), 3, "best")
    calc(F64, vals(3, "best", st), out + ["(порядок 1-2-3)"], None, "boundary")
    # Полоса: единицы
    for bu, bv, B in [("1", "1", 1), ("1000.0", "2,4", 2400), ("1000000.0", "20", 20e6)]:
        out, r = frags(DEF, 3, B=B)
        comment(f"Полоса {bv} {'Гц' if bu=='1' else ('кГц' if bu=='1000.0' else 'МГц')} → 10·lg B = {fmtnum(10*lg(B),6)} дБ; N = {fmtnum(r['N'],8)} дБм.")
        calc(F64, {"b": bv, "b_unit": bu}, out)
    # SNR / уровень сигнала / Ta
    st = DEF
    for kw, extra in [({"snr": 10}, {"snr": "10"}), ({"ps": -100}, {"ps": "-100"}), ({"snr": 10, "ps": -100}, {"snr": "10", "ps": "-100"}),
                      ({"snr": 20, "ps": -100}, {"snr": "20", "ps": "-100"}), ({"ta": 290}, {"ta": "290"}), ({"ta": 50, "snr": 12, "ps": -105}, {"ta": "50", "snr": "12", "ps": "-105"}),
                      ({"ta": 0}, {"ta": "0"}), ({"snr": 10, "ps": -90}, {"snr": "10", "ps": "-90"})]:
        out, r = frags(DEF, 3, **kw)
        comment(f"Опции {extra}: N = {fmtnum(r['N'],10)} дБм" + (f", SNR = {fmtnum(r['so'],8)} дБ" if r['so'] is not None else "") + ".")
        calc(F64, extra, out)
    # Ta = 290 даёт тот же порог шума, что и стандартный (проверка согласованности kT0·F·B)
    out, r = frags(DEF, 3, ta=290)
    comment("Ta = T0 = 290 К: k·(T0 + Te)·B = k·T0·F·B — тот же порог шума, что и без Ta (проверка согласованности формул).")
    # Рискованный вердикт: SNR у порога
    sec("Рискованный вердикт: SNR у порога")
    out, r = frags(DEF, 3)
    Nn = r["N"]
    ps_eq = Nn + 10
    comment(f"Порог шума N = {fmtnum(Nn,14)} дБм. Сигнал ps = N + 10 (14 знаков) при требуемом SNR 10 дБ → «не меньше» (сравнение с допуском 1e-9).")
    out, r = frags(DEF, 3, snr=10, ps=D(fmtnum(ps_eq, 13).replace(",", ".")))
    calc(F64, {"snr": "10", "ps": fmtnum(ps_eq, 13).replace(",", ".")}, ["Статус" + "Оценка: отношение сигнал/шум 10 дБ не меньше требуемых 10 дБ"], ["дБ меньше требуемых"], "boundary")
    for off, tag in [(D("0.001"), "ниже"), (D("-0.001"), "выше")]:
        pss = D(fmtnum(ps_eq - off, 13).replace(",", "."))
        out, r = frags(DEF, 3, snr=10, ps=pss)
        comment(f"ps = N + 10 {'−' if off>0 else '+'} 0,001 → SNR = {fmtnum(r['so'],10)} дБ: {'меньше' if off>0 else 'не меньше'} требуемых 10 дБ; число у порога: {fx(r['so'],10)}.")
        calc(F64, {"snr": "10", "ps": str(pss)}, [out[-1]], ["не меньше требуемых"] if off > 0 else ["дБ меньше требуемых"], "boundary")
    # ps = N + 10 − 1e-6
    pss = D(fmtnum(ps_eq - D("1e-6"), 13).replace(",", "."))
    out, r = frags(DEF, 3, snr=10, ps=pss)
    comment(f"Отклонение 1e-6 дБ от порога: SNR = {fx(r['so'],10)} дБ — число выводится с достаточным числом знаков, чтобы не совпасть с 10.")
    calc(F64, {"snr": "10", "ps": str(pss)}, [out[-1]], ["не меньше требуемых"], "boundary")

    comment("Порог SNR = 0 дБ: абсолютная нулевая граница — сигнал ps = N ± 1e-13 дБ даёт SNR 0 («не меньше требуемых 0 дБ»), а не «меньше на 1·10^-13»; ps = N − 0,01 — «меньше… не хватает 0,01».")
    for off in [D("1e-13"), D("-1e-13")]:
        calc(F64, {"snr": "0", "ps": fmtnum(Nn + off, 14).replace(",", ".")}, ["СтатусОценка: отношение сигнал/шум 0 дБ не меньше требуемых 0 дБ"], ["дБ меньше требуемых"], "boundary")
    calc(F64, {"snr": "0", "ps": fmtnum(Nn - D("0.01"), 14).replace(",", ".")}, ["СтатусОценка: отношение сигнал/шум -0,01 дБ меньше требуемых 0 дБ — не хватает 0,01 дБ"], ["не меньше требуемых"], "boundary")

    # Широкие диапазоны
    sec("Широкие диапазоны")
    st = [("att", "100", None)] * 5
    out, r = frags(mk(st), 5, "asis", B=1e12)
    comment(f"Пять аттенюаторов по 100 дБ, полоса 1 ТГц: суммарные потери 500 дБ, F = L = 10^50, NF = {fmtnum(r['nft'],8)} дБ, N = {fmtnum(r['N'],8)} дБм → «больше 1 ГВт»; числа без экспонент.")
    calc(F64, vals(5, "asis", st, b="1000000", b_unit="1000000.0"), out, None, "boundary")
    st = [("act", "100", "100"), ("act", "100", "100"), ("act", "-100", "0"), ("act", "0", "0"), ("act", "0", "0")]
    out, r = frags(mk(st), 5, "best", B=1e-3)
    comment(f"Крайние значения: G = ±100 дБ, NF = 100 дБ, полоса 0,001 Гц: N = {fmtnum(r['N'],8)} дБм, лучший порядок {'-'.join(str(x+1) for x in r['bo'])}.")
    calc(F64, vals(5, "best", st, b="0,001", b_unit="1"), out, None, "boundary")
    st = [("act", "20", "0.0000001"), ("act", "10", "0")]
    out, r = frags(mk(st), 2, "asis")
    comment("Очень малый NF = 1e-7 дБ: вклад и КШ показываются словами «меньше 0,001», без экспонент; Te < 0,001 К → «меньше 0,001 К».")
    calc(F64, vals(2, "asis", st), out, None, "boundary")

    # Неверный ввод
    sec("Неверный ввод")
    invalid(F64, {"g1": "x"}, "Каскад 1: введите усиление или потери числом в дБ")
    invalid(F64, {"g2": ""}, "Каскад 2: введите усиление или потери числом в дБ")
    invalid(F64, {"e1": "x"}, "Каскад 1: введите коэффициент шума числом в дБ")
    invalid(F64, {"e3": ""}, "Каскад 3: введите коэффициент шума числом в дБ")
    invalid(F64, {"g1": "101"}, "Каскад 1: усиление — от −100 до +100 дБ")
    invalid(F64, {"g3": "-101"}, "Каскад 3: усиление — от −100 до +100 дБ")
    invalid(F64, {"e1": "-0,1"}, "Каскад 1: коэффициент шума — от 0 до 100 дБ")
    invalid(F64, {"e3": "101"}, "Каскад 3: коэффициент шума — от 0 до 100 дБ")
    invalid(F64, {"g2": "-1"}, "Каскад 2: потери аттенюатора — от 0 до 100 дБ")
    invalid(F64, {"g2": "101"}, "Каскад 2: потери аттенюатора — от 0 до 100 дБ")
    invalid(F64, {"k2": "act", "e2": "x"}, "Каскад 2: введите коэффициент шума числом в дБ")
    invalid(F64, {"b": "x"}, "Введите полосу шума числом")
    invalid(F64, {"b": "0"}, "Полоса шума — больше 0 и не больше 1 ТГц")
    invalid(F64, {"b": "-5"}, "Полоса шума — больше 0 и не больше 1 ТГц")
    invalid(F64, {"b": "2000000", "b_unit": "1000000.0"}, "Полоса шума — больше 0 и не больше 1 ТГц")
    invalid(F64, {"snr": "x"}, "Требуемое SNR — число в дБ")
    invalid(F64, {"snr": "101"}, "Требуемое SNR — от −50 до +100 дБ")
    invalid(F64, {"ta": "x"}, "Шумовая температура источника — число в кельвинах")
    invalid(F64, {"ta": "-1"}, "Шумовая температура источника — от 0 до 1 000 000 К")
    invalid(F64, {"ps": "x"}, "Уровень сигнала — число в дБм")
    invalid(F64, {"ps": "101"}, "Уровень сигнала — от −250 до +100 дБм")
    # скрытые каскады не проверяются: при n = 2 мусор в поле каскада 4 не мешает
    calc(F64, {"n": "2", "g4": "x", "e4": "y"}, ["Позиция 2: каскад 2"], None, "boundary")
    invalid(F64, {"ta": "0", "n": "2", "k1": "act", "g1": "10", "e1": "0", "k2": "act", "g2": "10", "e2": "0"}, "Шумовая температура системы равна нулю")
