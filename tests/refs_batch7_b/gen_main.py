# -*- coding: utf-8 -*-
"""Эталоны партии №7 (тема B): python3 -I tests/refs_batch7_b/gen_main.py out.mjs
Печатает блок операторов (без структурной части) — то же, что в tests/_batch7_b.mjs.
Ожидаемые значения считаются на decimal.Decimal (70 знаков), без кода страниц."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gcommon, gen62, gen63, gen64
gen62.gen(); gen63.gen(); gen64.gen()
open(sys.argv[1], "w", encoding="utf-8").write("\n".join(gcommon.LINES) + "\n")
print(len(gcommon.LINES), "lines")
