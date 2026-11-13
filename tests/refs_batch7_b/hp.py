# -*- coding: utf-8 -*-
"""Независимая арифметика высокой точности для эталонов партии №7 (тема B).
Decimal, 60 знаков; sin/cos — собственные ряды Тейлора; pi — формула Мэчина.
Ничего из кода страниц не используется.
"""
from decimal import Decimal as D, getcontext, ROUND_HALF_UP
from fractions import Fraction as Fr
import math

getcontext().prec = 70

def _atan_inv(n):
    # arctan(1/n) рядом
    x = D(1) / D(n); x2 = x * x; term = x; s = x; k = 1
    while abs(term) > D(10) ** -68:
        term = -term * x2
        k += 2
        s += term / k
    return s

PI = 4 * (4 * _atan_inv(5) - _atan_inv(239))

def sincos(x):
    """sin и cos аргумента x (Decimal), приведение по модулю 2π."""
    x = x % (2 * PI)
    if x > PI: x -= 2 * PI
    # ряд Тейлора
    def series(first, parity):
        term = first; s = first; n = parity
        while abs(term) > D(10) ** -68:
            term = -term * x * x / ((n + 1) * (n + 2))
            n += 2
            s += term
        return s
    return series(x, 1), series(D(1), 0)

C0 = D(299792458)

def lg(x):
    return D(x).log10()

def fmtnum(x, p=4):
    """Как JS: Number(x.toPrecision(p)) → String с запятой (без экспоненты)."""
    x = D(x)
    if x == 0: return "0"
    e = x.adjusted()
    q = D(1).scaleb(e - p + 1)
    r = x.quantize(q, rounding=ROUND_HALF_UP) if (e - p + 1) < 0 or True else x
    f = float(r)
    s = repr(f)
    if "e" in s:
        raise ValueError("экспонента: " + s)
    if s.endswith(".0"): s = s[:-2]
    return s.replace(".", ",")

PREF = [(D(10) ** 9, "Г"), (D(10) ** 6, "М"), (D(10) ** 3, "к"), (D(1), ""), (D("0.001"), "м"), (D("0.000001"), "мк"), (D("1e-9"), "н"), (D("1e-12"), "п")]

def si(x, unit):
    x = D(x)
    if x == 0: return "0 " + unit
    for m, p in PREF:
        if abs(x) >= m:
            return fmtnum(x / m) + " " + p + unit
    return fmtnum(x / D("1e-12")) + " п" + unit

# ── эмуляция сравнений и fx страницы: только форматирование, значения — из эталона ──
def _tp(x, p):
    """Number(x.toPrecision(p)) как float"""
    x = D(x)
    if x == 0: return 0.0
    e = x.adjusted(); q = D(1).scaleb(e - p + 1)
    return float(x.quantize(q, rounding=ROUND_HALF_UP))

def _gt(a, b): return a > b + abs(b) * 1e-9
def _lt(a, b): return a < b - abs(b) * 1e-9

def fx(x, lim):
    x = float(x); lim = float(lim)
    if abs(x - lim) <= abs(lim) * 1e-9:
        return fmtnum(D(x), 4)
    for p in range(4, 13):
        r = _tp(D(x), p)
        if (_lt(r, lim) if x < lim else _gt(r, lim)) and r != _tp(D(lim), p):
            return fmtnum(D(x), p)
    return fmtnum(D(x), 12)

def sx(x, lim, unit):
    x = float(x); lim = float(lim)
    pr = [(1e9, "Г"), (1e6, "М"), (1e3, "к"), (1, ""), (1e-3, "м"), (1e-6, "мк"), (1e-9, "н"), (1e-12, "п")]
    i = 0
    while i < len(pr) - 1:
        if abs(x) >= pr[i][0]: break
        i += 1
    return fx(x / pr[i][0], lim / pr[i][0]) + " " + pr[i][1] + unit

def pw(dbm):
    dbm = D(dbm)
    if dbm < -120: return "меньше 1 фВт"
    if dbm > 120: return "больше 1 ГВт"
    return si(D(10) ** (dbm / 10) * D("0.001"), "Вт")

def dbs(x):
    x = D(x)
    if x != 0 and abs(x) < D("0.001"): return ("−" if x < 0 else "") + "меньше 0,001"
    return fmtnum(x)
