# -*- coding: utf-8 -*-
from pathlib import Path

from common import write_site
from data_a import CALCS_A
from data_b import CALCS_B
from data_c import CALCS_C
from data_d import CALCS_D
from data_e import CALCS_E
from data_f import CALCS_F
from data_g import CALCS_G
from data_h import CALCS_H
from data_i import CALCS_I
from data_j import CALCS_J
from data_k import CALCS_K
from data_l import CALCS_L
from data_m import CALCS_M
from data_n import CALCS_N
from data_o import CALCS_O
from data_p import CALCS_P
from data_q import CALCS_Q
from audit_metadata import apply_audit_metadata

CALCS = CALCS_A + CALCS_B + CALCS_C + CALCS_D + CALCS_E + CALCS_F + CALCS_G + CALCS_H + CALCS_I + CALCS_J + CALCS_K + CALCS_L + CALCS_M + CALCS_N + CALCS_O + CALCS_P + CALCS_Q
apply_audit_metadata(CALCS)

# notice-страницы остаются по своему URL, но ничего не вычисляют: калькулятор
# снят с публикации. В каталог и sitemap они не попадают.
PAGES = 145          # всего генерируемых страниц-разделов
CALCULATORS = 144    # из них с работающим расчётом
assert len(CALCS) == PAGES, "Ожидалось %d страниц, получено %d" % (PAGES, len(CALCS))
real = [c for c in CALCS if not c.get("notice")]
assert len(real) == CALCULATORS, "Ожидалось %d калькуляторов, получено %d" % (CALCULATORS, len(real))
slugs = [c["slug"] for c in CALCS]
assert len(set(slugs)) == PAGES, "Дубли slug: %s" % [s for s in slugs if slugs.count(s) > 1]

for c in CALCS:
    if c.get("notice"):
        assert "fields" not in c and "js" not in c, \
            "%s помечен notice, но содержит форму или расчёт" % c["slug"]
    else:
        assert c.get("fields") and c.get("js"), \
            "%s не notice, но без полей или расчёта" % c["slug"]

known = set(slugs)
for c in CALCS:
    missing = [s for s in c.get("related", []) if s not in known]
    assert not missing, "У %s ссылки на несуществующие слаги: %s" % (c["slug"], missing)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
write_site(CALCS, str(PROJECT_ROOT))
