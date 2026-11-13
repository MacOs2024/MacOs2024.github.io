# -*- coding: utf-8 -*-
import json
SC = []   # сценарии
LINES = []  # итоговые строки JS

def js(s):
    return json.dumps(s, ensure_ascii=False)

def comment(*lines):
    for l in lines:
        LINES.append("// " + l)

def sec(title):
    LINES.append("")
    LINES.append("// --- " + title + " ---")

def calc(file, values, present, absent=None, kind="functional", fn=None):
    """Один сценарий. absent → calculateWithout (запрещает также NaN/Infinity/экспоненту); kind — structural/functional/boundary."""
    vals = "{ " + ", ".join(f"{k}: {js(str(v))}" for k, v in values.items()) + " }" if values else "{}"
    pres = "[" + ", ".join(js(p) for p in present) + "]"
    k = '' if kind == "functional" else f', {js(kind)}'
    if absent is None:
        # calculateWithout без запретных фрагментов: заодно ловит NaN/Infinity/экспоненту в выводе
        LINES.append(f'await calculateWithout({js(file)}, {vals}, {pres}, []{k});')
    else:
        ab = "[" + ", ".join(js(a) for a in absent) + "]"
        LINES.append(f'await calculateWithout({js(file)}, {vals}, {pres}, {ab}{k});')

def exp(file, values, present, absent=None, kind="functional"):
    """Допускает экспоненту (calculateExp)."""
    vals = "{ " + ", ".join(f"{k}: {js(str(v))}" for k, v in values.items()) + " }" if values else "{}"
    pres = "[" + ", ".join(js(p) for p in present) + "]"
    ab = "[" + ", ".join(js(a) for a in (absent or [])) + "]"
    k = '' if kind == "functional" else f', {js(kind)}'
    LINES.append(f'await calculateExp({js(file)}, {vals}, {pres}, {ab}{k});')

def invalid(file, values, fragment):
    vals = "{ " + ", ".join(f"{k}: {js(str(v))}" for k, v in values.items()) + " }" if values else "{}"
    LINES.append(f'await invalid({js(file)}, {vals}, {js(fragment)});')

def raw(s):
    LINES.append(s)
